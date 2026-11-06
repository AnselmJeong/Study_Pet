import { useEffect, useState } from "react";
import type { AppSettings, ModelInfo, OpenAIPreset, ProviderId, TestResult } from "../../shared/types";
import { api } from "../common/rpc";
import { CharacterSection } from "./CharacterSection";

const PROVIDERS: { id: ProviderId; label: string }[] = [
	{ id: "claude-sub", label: "Claude 구독 (Claude Code 로그인)" },
	{ id: "openai-compat", label: "OpenAI 호환 API (Ollama Cloud 등)" },
];

const OPENAI_PRESETS: { id: OpenAIPreset; label: string; baseUrl: string }[] = [
	{ id: "ollama-cloud", label: "Ollama Cloud", baseUrl: "https://ollama.com/v1" },
	{ id: "custom", label: "직접 입력", baseUrl: "" },
];

const inputCls = "w-full rounded-md border border-slate-200 p-2 font-mono text-xs";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="space-y-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
			<h2 className="font-semibold text-slate-700">{title}</h2>
			{children}
		</section>
	);
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
	return (
		<label className="block">
			<span className="mb-1 block text-xs text-slate-500">{label}</span>
			{children}
			{hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
		</label>
	);
}

function ModelInput({
	value,
	onChange,
	models,
	id,
}: {
	value: string;
	onChange: (v: string) => void;
	models: ModelInfo[];
	id: string;
}) {
	return (
		<>
			<input list={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder="모델 (목록에서 고르거나 직접 입력)" className={inputCls} />
			<datalist id={id}>
				{models.map((m) => (
					<option key={m.id} value={m.id}>
						{m.label ?? m.id}
					</option>
				))}
			</datalist>
		</>
	);
}

export function SettingsTab() {
	const [s, setS] = useState<AppSettings | null>(null);
	const [claudeKey, setClaudeKey] = useState("");
	const [openaiKey, setOpenaiKey] = useState("");
	const [tinyfishKey, setTinyfishKey] = useState("");
	const [searchTest, setSearchTest] = useState<TestResult | "running" | null>(null);
	const [claudeModels, setClaudeModels] = useState<ModelInfo[]>([]);
	const [openaiModels, setOpenaiModels] = useState<ModelInfo[]>([]);
	const [modelMsg, setModelMsg] = useState<string | null>(null);
	const [tests, setTests] = useState<Partial<Record<ProviderId, TestResult | "running">>>({});
	const [saved, setSaved] = useState(false);
	const [screenOk, setScreenOk] = useState<boolean | null>(null);

	useEffect(() => {
		api.getSettings({}).then((x) => {
			setS(x);
			api.listModels({ provider: "claude-sub", settings: x }).then((r) => setClaudeModels(r.models));
		});
		api.getScreenPermission({}).then((p) => setScreenOk(p.granted)).catch(() => {});
	}, []);

	if (!s) return <div className="p-4 text-sm text-slate-400">불러오는 중…</div>;

	const patch = (fn: (d: AppSettings) => void) => {
		const d = structuredClone(s);
		fn(d);
		setS(d);
		setSaved(false);
	};
	const usesOpenai = s.chatProvider === "openai-compat" || s.summaryProvider === "openai-compat";

	async function loadOpenaiModels() {
		setModelMsg("불러오는 중…");
		const r = await api.listModels({ provider: "openai-compat", settings: s!, apiKey: openaiKey || undefined });
		setOpenaiModels(r.models);
		setModelMsg(r.ok ? `${r.models.length}개 모델` : `실패: ${r.detail ?? ""}`);
	}

	async function runTest(provider: ProviderId) {
		setTests((t) => ({ ...t, [provider]: "running" }));
		const key = provider === "claude-sub" ? claudeKey : openaiKey;
		const r = await api.testConnection({ provider, settings: s!, apiKey: key || undefined });
		setTests((t) => ({ ...t, [provider]: r }));
		if (provider === "openai-compat" && r.ok && r.vision !== undefined) patch((d) => (d.openai.vision = r.vision!));
	}

	async function save(keys?: { claude?: string | null; openai?: string | null; tinyfish?: string | null }) {
		const k = keys ?? {
			claude: claudeKey.trim() ? claudeKey : undefined,
			openai: openaiKey.trim() ? openaiKey : undefined,
			tinyfish: tinyfishKey.trim() ? tinyfishKey : undefined,
		};
		const next = await api.saveSettings({ settings: s!, apiKeys: k });
		setS(next);
		setClaudeKey("");
		setOpenaiKey("");
		setTinyfishKey("");
		setSaved(true);
	}

	const TestLine = ({ provider }: { provider: ProviderId }) => {
		const t = tests[provider];
		return (
			<div className="flex items-center gap-2">
				<button
					onClick={() => runTest(provider)}
					disabled={t === "running"}
					className="shrink-0 rounded-md bg-slate-800 px-3 py-1.5 text-xs text-white disabled:opacity-50"
				>
					{t === "running" ? "테스트 중…" : "연결 테스트"}
				</button>
				{t && t !== "running" && (
					<span className={`text-xs ${t.ok ? "text-emerald-700" : "text-rose-600"}`}>
						{t.ok ? "✓ " : "✗ "}
						{t.detail}
					</span>
				)}
			</div>
		);
	};

	return (
		<div className="h-full space-y-4 overflow-y-auto bg-slate-50 p-4 text-sm">
			<Section title="어떤 AI를 쓸까">
				<Field label="질문에 답할 때">
					<select value={s.chatProvider} onChange={(e) => patch((d) => (d.chatProvider = e.target.value as ProviderId))} className="w-full rounded-md border border-slate-200 bg-white p-2">
						{PROVIDERS.map((p) => (
							<option key={p.id} value={p.id}>
								{p.label}
							</option>
						))}
					</select>
				</Field>
				<Field label="1분마다 화면 요약, 격려·농담 말 걸기">
					<select value={s.summaryProvider} onChange={(e) => patch((d) => (d.summaryProvider = e.target.value as ProviderId))} className="w-full rounded-md border border-slate-200 bg-white p-2">
						{PROVIDERS.map((p) => (
							<option key={p.id} value={p.id}>
								{p.label}
							</option>
						))}
					</select>
				</Field>
			</Section>

			<Section title="Claude 구독">
				<p className="text-xs text-slate-500">
					이 Mac에 로그인된 Claude Code 계정(Pro/Max 구독)을 그대로 써. 터미널에서 <code>claude</code>를 한 번 실행해 로그인해 두면 돼. API 키를 넣으면 구독 대신 API 요금으로 동작해.
				</p>
				<div className="grid grid-cols-2 gap-2">
					<Field label="대화 모델">
						<ModelInput id="claude-chat" value={s.claude.chatModel} onChange={(v) => patch((d) => (d.claude.chatModel = v))} models={claudeModels} />
					</Field>
					<Field label="화면 요약 모델">
						<ModelInput id="claude-sum" value={s.claude.summaryModel} onChange={(v) => patch((d) => (d.claude.summaryModel = v))} models={claudeModels} />
					</Field>
				</div>
				<Field label="API 키 (선택)">
					<div className="flex gap-2">
						<input
							type="password"
							value={claudeKey}
							onChange={(e) => setClaudeKey(e.target.value)}
							placeholder={s.claude.hasApiKey ? "••••••••  (Keychain에 저장됨)" : "비워 두면 구독 로그인 사용"}
							className={inputCls}
						/>
						{s.claude.hasApiKey && (
							<button onClick={() => save({ claude: null })} className="shrink-0 rounded-md px-2 text-xs text-rose-600 hover:bg-rose-50">
								키 삭제
							</button>
						)}
					</div>
				</Field>
				<Field label="Claude Code 실행 파일 경로 (선택)" hint="비워 두면 내장 실행 파일을 써. 안 되면 `which claude` 결과를 넣어 줘.">
					<input value={s.claude.cliPath} onChange={(e) => patch((d) => (d.claude.cliPath = e.target.value))} placeholder="/opt/homebrew/bin/claude" className={inputCls} />
				</Field>
				<TestLine provider="claude-sub" />
			</Section>

			<Section title={`OpenAI 호환 API${usesOpenai ? "" : " (지금은 안 씀)"}`}>
				<Field label="종류">
					<select
						value={s.openai.preset}
						onChange={(e) => {
							const np = OPENAI_PRESETS.find((x) => x.id === e.target.value)!;
							setOpenaiModels([]);
							patch((d) => {
								d.openai.preset = np.id;
								if (np.baseUrl) d.openai.baseUrl = np.baseUrl;
							});
						}}
						className="w-full rounded-md border border-slate-200 bg-white p-2"
					>
						{OPENAI_PRESETS.map((x) => (
							<option key={x.id} value={x.id}>
								{x.label}
							</option>
						))}
					</select>
				</Field>
				<Field label="Base URL">
					<input value={s.openai.baseUrl} onChange={(e) => patch((d) => (d.openai.baseUrl = e.target.value))} placeholder="https://…/v1" className={inputCls} />
				</Field>
				<Field label="API 키" hint={s.openai.preset === "ollama-cloud" ? "ollama.com → Settings → API keys 에서 발급" : undefined}>
					<div className="flex gap-2">
						<input
							type="password"
							value={openaiKey}
							onChange={(e) => setOpenaiKey(e.target.value)}
							placeholder={s.openai.hasApiKey ? "••••••••  (Keychain에 저장됨)" : "키를 입력"}
							className={inputCls}
						/>
						{s.openai.hasApiKey && (
							<button onClick={() => save({ openai: null })} className="shrink-0 rounded-md px-2 text-xs text-rose-600 hover:bg-rose-50">
								키 삭제
							</button>
						)}
					</div>
				</Field>
				<div className="grid grid-cols-2 gap-2">
					<Field label="대화 모델">
						<ModelInput id="oa-chat" value={s.openai.chatModel} onChange={(v) => patch((d) => (d.openai.chatModel = v))} models={openaiModels} />
					</Field>
					<Field label="화면 요약 모델">
						<ModelInput id="oa-sum" value={s.openai.summaryModel} onChange={(v) => patch((d) => (d.openai.summaryModel = v))} models={openaiModels} />
					</Field>
				</div>
				<div className="flex items-center gap-2">
					<button onClick={loadOpenaiModels} className="rounded-md bg-slate-100 px-3 py-1.5 text-xs hover:bg-slate-200">
						모델 목록 불러오기
					</button>
					{modelMsg && <span className="text-[11px] text-slate-400">{modelMsg}</span>}
				</div>
				<label className="flex items-center gap-2 text-xs">
					<input type="checkbox" checked={s.openai.vision} onChange={(e) => patch((d) => (d.openai.vision = e.target.checked))} />
					이 모델은 이미지를 볼 수 있음 (화면 요약·첨부에 필요)
				</label>
				<TestLine provider="openai-compat" />
			</Section>

			<Section title="화면 기록">
				<div className="grid grid-cols-3 gap-2">
					<Field label="기록 간격 (초)">
						<input type="number" min={20} value={s.capture.intervalSec} onChange={(e) => patch((d) => (d.capture.intervalSec = Number(e.target.value)))} className={inputCls} />
					</Field>
					<Field label="최대 보관 장수">
						<input type="number" min={1} value={s.capture.maxShots} onChange={(e) => patch((d) => (d.capture.maxShots = Number(e.target.value)))} className={inputCls} />
					</Field>
					<Field label="보관 시간 (분)">
						<input type="number" min={5} value={s.capture.retentionMin} onChange={(e) => patch((d) => (d.capture.retentionMin = Number(e.target.value)))} className={inputCls} />
					</Field>
				</div>
				<p className="text-[11px] text-slate-400">
					스크린샷은 장수나 보관 시간 중 하나라도 넘으면 자동으로 지워져. 텍스트 요약은 30일 동안 남아.
				</p>
				<div className="grid grid-cols-2 gap-2">
					<Field label="자동 일시정지 (분)">
						<input type="number" min={2} max={60} value={s.capture.autoPauseMin} onChange={(e) => patch((d) => (d.capture.autoPauseMin = Number(e.target.value)))} className={inputCls} />
					</Field>
					<Field label="입력 없을 때 기록 간격 (분)">
						<input type="number" min={1} max={15} value={s.capture.idleIntervalMin} onChange={(e) => patch((d) => (d.capture.idleIntervalMin = Number(e.target.value)))} className={inputCls} />
					</Field>
				</div>
				<p className="text-[11px] text-slate-400">
					화면이 잠기면 바로 멈추고, 입력도 화면 변화도 없이 자동 일시정지 시간이 지나면 멈춰. 다시 키보드나 마우스를 쓰면 이어서 기록해. 입력 없이 화면만 바뀔 때(영상 등)는 더 긴 간격으로 기록해.
				</p>
				<Field label="기록하지 않을 앱 (쉼표로 구분)">
					<input
						value={s.capture.excludedApps.join(", ")}
						onChange={(e) => patch((d) => (d.capture.excludedApps = e.target.value.split(",").map((x) => x.trim()).filter(Boolean)))}
						className={inputCls}
					/>
				</Field>
				<div className="flex items-center gap-2 text-xs">
					<span>화면 기록 권한:</span>
					<span className={screenOk ? "text-emerald-700" : "text-amber-600"}>
						{screenOk === null ? "확인 중…" : screenOk ? "✓ 허용됨" : "아직 허용되지 않음"}
					</span>
					{!screenOk && (
						<button onClick={async () => setScreenOk((await api.requestScreenPermission({})).granted)} className="rounded-md bg-slate-100 px-2 py-1 hover:bg-slate-200">
							권한 요청 / 설정 열기
						</button>
					)}
				</div>
			</Section>

			<Section title="웹 검색 (TinyFish)">
				<label className="flex items-center gap-2">
					<input type="checkbox" checked={s.search.enabled} onChange={(e) => patch((d) => (d.search.enabled = e.target.checked))} />
					웹 검색 사용 (필요할 때 잉키가 알아서 검색, 🔎를 켜면 항상 검색)
				</label>
				<Field label="TinyFish API 키" hint="agent.tinyfish.ai/api-keys 에서 만들 수 있어. 검색은 무료야.">
					<div className="flex gap-2">
						<input
							type="password"
							value={tinyfishKey}
							onChange={(e) => setTinyfishKey(e.target.value)}
							placeholder={s.search.hasApiKey ? "••••••••  (Keychain에 저장됨)" : "키를 입력"}
							className={inputCls}
						/>
						{s.search.hasApiKey && (
							<button onClick={() => save({ tinyfish: null })} className="shrink-0 rounded-md px-2 text-xs text-rose-600 hover:bg-rose-50">
								키 삭제
							</button>
						)}
					</div>
				</Field>
				<div className="flex items-center gap-2">
					<button
						onClick={async () => {
							setSearchTest("running");
							setSearchTest(await api.testSearch({ apiKey: tinyfishKey || undefined }));
						}}
						disabled={searchTest === "running"}
						className="shrink-0 rounded-md bg-slate-800 px-3 py-1.5 text-xs text-white disabled:opacity-50"
					>
						{searchTest === "running" ? "테스트 중…" : "검색 테스트"}
					</button>
					{searchTest && searchTest !== "running" && (
						<span className={`text-xs ${searchTest.ok ? "text-emerald-700" : "text-rose-600"}`}>
							{searchTest.ok ? "✓ " : "✗ "}
							{searchTest.detail}
						</span>
					)}
				</div>
			</Section>

			<Section title="잉키의 말 걸기">
				<label className="flex items-center gap-2">
					<input type="checkbox" checked={s.proactive.enabled} onChange={(e) => patch((d) => (d.proactive.enabled = e.target.checked))} />
					가끔 먼저 격려하거나 말 걸기
				</label>
				<label className="flex items-center gap-2">
					<input type="checkbox" checked={s.proactive.jokes} onChange={(e) => patch((d) => (d.proactive.jokes = e.target.checked))} />
					농담도 섞기
				</label>
				<div className="grid grid-cols-2 gap-2">
					<Field label="최소 간격 (분)">
						<input type="number" min={3} value={s.proactive.minIntervalMin} onChange={(e) => patch((d) => (d.proactive.minIntervalMin = Number(e.target.value)))} className={inputCls} />
					</Field>
					<Field label="최대 간격 (분)">
						<input type="number" min={3} value={s.proactive.maxIntervalMin} onChange={(e) => patch((d) => (d.proactive.maxIntervalMin = Number(e.target.value)))} className={inputCls} />
					</Field>
				</div>
			</Section>

			<Section title="캐릭터">
				<CharacterSection />
			</Section>

			<Section title="대화">
				<label className="flex items-center gap-2">
					<input type="checkbox" checked={s.attachScreenByDefault} onChange={(e) => patch((d) => (d.attachScreenByDefault = e.target.checked))} />
					질문할 때 현재 화면을 기본으로 첨부
				</label>
				<div className="flex items-center gap-4">
					<span className="text-xs text-slate-500">말투</span>
					{(
						[
							["banmal", "반말"],
							["jondaetmal", "존댓말"],
						] as const
					).map(([v, label]) => (
						<label key={v} className="flex items-center gap-1">
							<input type="radio" checked={s.tone === v} onChange={() => patch((d) => (d.tone = v))} />
							{label}
						</label>
					))}
				</div>
			</Section>

			<div className="sticky bottom-0 flex items-center gap-3 border-t border-slate-200 bg-slate-50 py-3">
				<button onClick={() => save()} className="rounded-md bg-indigo-600 px-4 py-1.5 text-white">
					저장
				</button>
				{saved && <span className="text-xs text-emerald-700">저장했어</span>}
			</div>
		</div>
	);
}
