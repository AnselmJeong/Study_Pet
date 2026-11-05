import { useEffect, useState } from "react";
import type { AppSettings, ModelInfo, ProviderPreset, TestResult } from "../../shared/types";
import { api } from "../common/rpc";

const PRESETS: { id: ProviderPreset; label: string; baseUrl: string; needsKey: boolean }[] = [
	{ id: "ollama-cloud", label: "Ollama Cloud", baseUrl: "https://ollama.com/v1", needsKey: true },
	{ id: "ollama-local", label: "로컬 Ollama", baseUrl: "http://localhost:11434/v1", needsKey: false },
	{ id: "custom", label: "직접 입력 (OpenAI 호환)", baseUrl: "", needsKey: true },
];

export function SettingsTab() {
	const [s, setS] = useState<AppSettings | null>(null);
	const [apiKey, setApiKey] = useState(""); // 새로 입력한 키 (비어 있으면 기존 키 유지)
	const [models, setModels] = useState<ModelInfo[]>([]);
	const [modelMsg, setModelMsg] = useState<string | null>(null);
	const [test, setTest] = useState<TestResult | null>(null);
	const [testing, setTesting] = useState(false);
	const [saved, setSaved] = useState(false);
	const [screenOk, setScreenOk] = useState<boolean | null>(null);

	useEffect(() => {
		api.getSettings({}).then(setS).catch(console.error);
		api.getScreenPermission({}).then((p) => setScreenOk(p.granted)).catch(() => {});
	}, []);

	if (!s) return <div className="p-4 text-sm text-slate-400">불러오는 중…</div>;
	const p = s.provider;
	const preset = PRESETS.find((x) => x.id === p.preset)!;
	const keyArg = apiKey.trim() ? apiKey.trim() : undefined;

	const setProvider = (patch: Partial<AppSettings["provider"]>) => {
		setSaved(false);
		setS({ ...s, provider: { ...p, ...patch } });
	};

	async function loadModels() {
		setModelMsg("불러오는 중…");
		const res = await api.listModels({ provider: p, apiKey: keyArg });
		setModels(res.models);
		setModelMsg(res.ok ? `${res.models.length}개 모델` : `실패: ${res.detail ?? ""}`);
	}

	async function runTest() {
		setTesting(true);
		setTest(null);
		const res = await api.testConnection({ provider: p, apiKey: keyArg });
		setTest(res);
		setTesting(false);
		if (res.ok && res.vision !== undefined) setProvider({ vision: res.vision });
	}

	async function save() {
		const next = await api.saveSettings({ settings: s!, apiKey: keyArg });
		setS(next);
		setApiKey("");
		setSaved(true);
	}

	async function removeKey() {
		const next = await api.saveSettings({ settings: s!, apiKey: null });
		setS(next);
		setApiKey("");
	}

	return (
		<div className="h-full space-y-5 overflow-y-auto p-4 text-sm">
			<section className="space-y-3">
				<h2 className="font-semibold text-slate-700">LLM 제공자</h2>
				<p className="text-xs text-slate-500">
					지금은 OpenAI 호환 API(Ollama 등)를 지원해. Claude·Codex 구독 연결은 다음 단계에서 추가할게.
				</p>

				<label className="block">
					<span className="mb-1 block text-xs text-slate-500">종류</span>
					<select
						value={p.preset}
						onChange={(e) => {
							const np = PRESETS.find((x) => x.id === e.target.value)!;
							setModels([]);
							setTest(null);
							setProvider({ preset: np.id, baseUrl: np.baseUrl || p.baseUrl, model: "" });
						}}
						className="w-full rounded-md border border-slate-200 bg-white p-2"
					>
						{PRESETS.map((x) => (
							<option key={x.id} value={x.id}>
								{x.label}
							</option>
						))}
					</select>
				</label>

				<label className="block">
					<span className="mb-1 block text-xs text-slate-500">Base URL</span>
					<input
						value={p.baseUrl}
						onChange={(e) => setProvider({ baseUrl: e.target.value })}
						placeholder="https://…/v1"
						className="w-full rounded-md border border-slate-200 p-2 font-mono text-xs"
					/>
				</label>

				<label className="block">
					<span className="mb-1 block text-xs text-slate-500">
						API 키 {preset.needsKey ? "" : "(로컬은 보통 필요 없음)"}
					</span>
					<div className="flex gap-2">
						<input
							type="password"
							value={apiKey}
							onChange={(e) => {
								setApiKey(e.target.value);
								setSaved(false);
							}}
							placeholder={p.hasApiKey ? "••••••••  (Keychain에 저장됨, 바꾸려면 새로 입력)" : "키를 입력"}
							className="w-full rounded-md border border-slate-200 p-2 font-mono text-xs"
						/>
						{p.hasApiKey && (
							<button onClick={removeKey} className="shrink-0 rounded-md px-2 text-xs text-rose-600 hover:bg-rose-50">
								키 삭제
							</button>
						)}
					</div>
					{p.preset === "ollama-cloud" && (
						<span className="mt-1 block text-[11px] text-slate-400">ollama.com → Settings → API keys 에서 발급</span>
					)}
				</label>

				<div>
					<span className="mb-1 block text-xs text-slate-500">모델</span>
					<div className="flex gap-2">
						<input
							list="model-list"
							value={p.model}
							onChange={(e) => setProvider({ model: e.target.value })}
							placeholder="모델 이름 (목록에서 고르거나 직접 입력)"
							className="w-full rounded-md border border-slate-200 p-2 font-mono text-xs"
						/>
						<datalist id="model-list">
							{models.map((m) => (
								<option key={m.id} value={m.id} />
							))}
						</datalist>
						<button onClick={loadModels} className="shrink-0 rounded-md bg-slate-100 px-3 text-xs hover:bg-slate-200">
							목록 불러오기
						</button>
					</div>
					{models.length > 0 && (
						<select
							value={models.some((m) => m.id === p.model) ? p.model : ""}
							onChange={(e) => setProvider({ model: e.target.value })}
							className="mt-2 w-full rounded-md border border-slate-200 bg-white p-2 font-mono text-xs"
						>
							<option value="">— 목록에서 선택 —</option>
							{models.map((m) => (
								<option key={m.id} value={m.id}>
									{m.id}
								</option>
							))}
						</select>
					)}
					{modelMsg && <span className="mt-1 block text-[11px] text-slate-400">{modelMsg}</span>}
				</div>

				<label className="flex items-center gap-2">
					<input type="checkbox" checked={p.vision} onChange={(e) => setProvider({ vision: e.target.checked })} />
					이 모델은 이미지를 볼 수 있음 (화면 첨부에 필요)
				</label>

				<div className="flex items-center gap-2">
					<button
						onClick={runTest}
						disabled={testing}
						className="rounded-md bg-slate-800 px-3 py-1.5 text-xs text-white disabled:opacity-50"
					>
						{testing ? "테스트 중…" : "연결 테스트"}
					</button>
					{test && (
						<span className={`text-xs ${test.ok ? "text-emerald-700" : "text-rose-600"}`}>
							{test.ok ? "✓ " : "✗ "}
							{test.detail}
						</span>
					)}
				</div>
			</section>

			<section className="space-y-2">
				<h2 className="font-semibold text-slate-700">대화</h2>
				<label className="flex items-center gap-2">
					<input
						type="checkbox"
						checked={s.attachScreenByDefault}
						onChange={(e) => {
							setSaved(false);
							setS({ ...s, attachScreenByDefault: e.target.checked });
						}}
					/>
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
							<input
								type="radio"
								checked={s.tone === v}
								onChange={() => {
									setSaved(false);
									setS({ ...s, tone: v });
								}}
							/>
							{label}
						</label>
					))}
				</div>
			</section>

			<section className="space-y-2">
				<h2 className="font-semibold text-slate-700">화면 기록 권한</h2>
				<div className="flex items-center gap-2 text-xs">
					<span className={screenOk ? "text-emerald-700" : "text-amber-600"}>
						{screenOk === null ? "확인 중…" : screenOk ? "✓ 허용됨" : "아직 허용되지 않음"}
					</span>
					{!screenOk && (
						<button
							onClick={async () => setScreenOk((await api.requestScreenPermission({})).granted)}
							className="rounded-md bg-slate-100 px-2 py-1 hover:bg-slate-200"
						>
							권한 요청 / 설정 열기
						</button>
					)}
				</div>
				<p className="text-[11px] text-slate-400">
					허용한 뒤에는 앱을 다시 실행해야 적용돼. 스크린샷은 이 Mac에만 최근 20장까지 저장돼.
				</p>
			</section>

			<div className="sticky bottom-0 flex items-center gap-3 border-t border-slate-200 bg-slate-50 py-3">
				<button onClick={save} className="rounded-md bg-indigo-600 px-4 py-1.5 text-white">
					저장
				</button>
				{saved && <span className="text-xs text-emerald-700">저장했어</span>}
			</div>
		</div>
	);
}
