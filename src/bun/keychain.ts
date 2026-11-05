// macOS Keychain에 API 키를 저장한다 (`security` CLI 사용).
// 키 값은 Bun 프로세스 밖(WebView, 설정 파일)으로 나가지 않는다.

const SERVICE = "dev.anselm.studypet";

function run(args: string[]): { ok: boolean; stdout: string } {
	if (process.platform !== "darwin") return { ok: false, stdout: "" };
	const res = Bun.spawnSync(["/usr/bin/security", ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	return { ok: res.exitCode === 0, stdout: res.stdout.toString().trim() };
}

export function getApiKey(account: string): string | null {
	const res = run(["find-generic-password", "-s", SERVICE, "-a", account, "-w"]);
	return res.ok && res.stdout ? res.stdout : null;
}

export function setApiKey(account: string, key: string): boolean {
	// -U: 이미 있으면 갱신
	return run([
		"add-generic-password",
		"-U",
		"-s",
		SERVICE,
		"-a",
		account,
		"-w",
		key,
	]).ok;
}

export function deleteApiKey(account: string): boolean {
	return run(["delete-generic-password", "-s", SERVICE, "-a", account]).ok;
}
