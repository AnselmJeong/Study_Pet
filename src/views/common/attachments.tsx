// 질문에 붙이는 이미지: 붙여넣기, 끌어놓기, 📷 지금 화면, ✂︎ 영역 캡처.
// 파일은 Bun이 저장하고, 여기서는 id와 작은 미리보기만 들고 있다.

import { useCallback, useEffect, useRef, useState } from "react";
import type { AttachResult, Attachment } from "../../shared/types";
import { api, on } from "./rpc";

export const MAX_ATTACHMENTS = 4;

type AttachError = { message: string; permission?: boolean };

function readAsDataURL(f: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(String(r.result));
		r.onerror = () => reject(r.error);
		r.readAsDataURL(f);
	});
}

export function useAttachments(opts: { from: "pet" | "panel"; onIncoming?: () => void }) {
	const [items, setItems] = useState<Attachment[]>([]);
	const [error, setError] = useState<AttachError | null>(null);
	const [working, setWorking] = useState(false);
	const itemsRef = useRef(items);
	itemsRef.current = items;
	const onIncoming = useRef(opts.onIncoming);
	onIncoming.current = opts.onIncoming;

	const accept = useCallback((r: AttachResult): boolean => {
		if (r.ok) {
			setItems((prev) => {
				if (prev.length >= MAX_ATTACHMENTS) {
					void api.discardAttachment({ id: r.attachment.id }).catch(() => {});
					return prev;
				}
				return [...prev, r.attachment];
			});
			setError(null);
			return true;
		}
		if (r.reason === "canceled") return false; // Esc: 조용히 취소
		setError(
			r.reason === "permission"
				? { message: "화면 기록 권한이 꺼져 있어요 (켠 뒤 Inky 다시 실행)", permission: true }
				: { message: r.message ?? "이미지를 붙이지 못했어" },
		);
		return false;
	}, []);

	const full = () => {
		if (itemsRef.current.length >= MAX_ATTACHMENTS) {
			setError({ message: `이미지는 ${MAX_ATTACHMENTS}장까지만 붙일 수 있어` });
			return true;
		}
		return false;
	};

	const addFiles = useCallback(
		async (files: File[]) => {
			const imgs = files.filter((f) => f.type.startsWith("image/"));
			if (!imgs.length) return false;
			setWorking(true);
			try {
				for (const f of imgs) {
					if (full()) break;
					try {
						accept(await api.addAttachment({ data: await readAsDataURL(f), mime: f.type }));
					} catch (err) {
						setError({ message: `이미지를 붙이지 못했어: ${String(err).slice(0, 80)}` });
					}
				}
			} finally {
				setWorking(false);
			}
			return true;
		},
		[accept],
	);

	const capture = useCallback(
		async (mode: "screen" | "region") => {
			if (full()) return;
			setWorking(true);
			try {
				accept(await api.captureAttachment({ mode, from: opts.from }));
			} catch (err) {
				setError({ message: `캡처 실패: ${String(err).slice(0, 80)}` });
			} finally {
				setWorking(false);
			}
		},
		[accept, opts.from],
	);

	const remove = useCallback((id: string) => {
		setItems((prev) => prev.filter((a) => a.id !== id));
		void api.discardAttachment({ id }).catch(() => {});
	}, []);

	/** 보낸 뒤: Bun이 파일을 지우므로 목록만 비운다 */
	const sent = useCallback(() => {
		setItems([]);
		setError(null);
	}, []);

	const onPaste = useCallback(
		(e: React.ClipboardEvent) => {
			const files = Array.from(e.clipboardData.items)
				.filter((it) => it.kind === "file" && it.type.startsWith("image/"))
				.map((it) => it.getAsFile())
				.filter((f): f is File => Boolean(f));
			if (!files.length) return; // 글자 붙여넣기는 그대로
			e.preventDefault();
			void addFiles(files);
		},
		[addFiles],
	);

	// 창 어디에 끌어놓아도 받는다. 기본 동작(파일 열기로 페이지 이동)은 막는다
	useEffect(() => {
		const over = (e: DragEvent) => {
			if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
		};
		const drop = (e: DragEvent) => {
			const files = Array.from(e.dataTransfer?.files ?? []);
			if (!files.length) return;
			e.preventDefault();
			if (files.some((f) => f.type.startsWith("image/"))) {
				onIncoming.current?.();
				void addFiles(files);
			} else setError({ message: "이미지 파일만 붙일 수 있어" });
		};
		window.addEventListener("dragover", over);
		window.addEventListener("drop", drop);
		const offs = [
			on("attachmentAdded", (a) => accept({ ok: true, attachment: a })),
			on("attachmentError", ({ reason, message }) =>
				setError(reason === "permission" ? { message: "화면 기록 권한이 꺼져 있어요 (켠 뒤 Inky 다시 실행)", permission: true } : { message }),
			),
		];
		return () => {
			window.removeEventListener("dragover", over);
			window.removeEventListener("drop", drop);
			offs.forEach((off) => off());
		};
	}, [addFiles, accept]);

	return { items, error, setError, working, capture, remove, sent, onPaste, ids: items.map((a) => a.id) };
}

export type AttachState = ReturnType<typeof useAttachments>;

/** 📷 지금 화면 / ✂︎ 영역 버튼 */
export function CaptureButtons({ a, dark }: { a: AttachState; dark?: boolean }) {
	const cls = dark
		? "rounded-md px-1.5 py-0.5 text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40"
		: "rounded-md px-1.5 py-0.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40";
	const full = a.items.length >= MAX_ATTACHMENTS;
	return (
		<div className="flex items-center gap-0.5">
			<button
				className={cls}
				disabled={a.working || full}
				onClick={() => void a.capture("screen")}
				title="지금 화면 전체를 찍어서 붙여 (캐릭터는 잠깐 숨어). 보내기 전에 미리보기로 확인할 수 있어"
			>
				📷 화면
			</button>
			<button
				className={cls}
				disabled={a.working || full}
				onClick={() => void a.capture("region")}
				title="영역을 드래그하거나 스페이스로 창을 골라 찍어서 붙여 (Esc 취소)"
			>
				✂︎ 영역
			</button>
		</div>
	);
}

/** 붙인 이미지 미리보기 줄 + 오류 */
export function AttachStrip({ a, dark }: { a: AttachState; dark?: boolean }) {
	if (!a.items.length && !a.error && !a.working) return null;
	return (
		<div className="space-y-1">
			{(a.items.length > 0 || a.working) && (
				<div className="flex flex-wrap items-center gap-1.5">
					{a.items.map((it) => (
						<div key={it.id} className="group relative h-12 w-12 overflow-hidden rounded-md ring-1 ring-black/20">
							{it.thumb ? (
								<img src={it.thumb} className="h-full w-full object-cover" title={it.kind === "screen" ? "지금 화면" : it.kind === "region" ? "영역 캡처" : "붙인 이미지"} />
							) : (
								<div className="flex h-full w-full items-center justify-center bg-slate-200 text-[10px] text-slate-500">이미지</div>
							)}
							<button
								onClick={() => a.remove(it.id)}
								className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-bl-md bg-black/70 text-[10px] leading-none text-white"
								title="빼기"
							>
								✕
							</button>
						</div>
					))}
					{a.working && <span className={`text-[11px] ${dark ? "text-slate-400" : "text-slate-500"}`}>붙이는 중…</span>}
				</div>
			)}
			{a.error && (
				<div className={`flex items-center gap-2 text-[11px] ${dark ? "text-amber-300" : "text-amber-700"}`}>
					<span className="min-w-0 flex-1">{a.error.message}</span>
					{a.error.permission && (
						<button
							className={`shrink-0 rounded-full px-2 py-0.5 ${dark ? "bg-amber-400/20 hover:bg-amber-400/30" : "bg-amber-100 hover:bg-amber-200"}`}
							onClick={() => void api.openScreenSettings({})}
						>
							설정 열기
						</button>
					)}
					<button className="shrink-0 opacity-70 hover:opacity-100" onClick={() => a.setError(null)} title="닫기">
						✕
					</button>
				</div>
			)}
		</div>
	);
}
