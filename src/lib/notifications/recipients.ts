// 알림 수신자(User Key) 레지스트리 — data/notify-recipients.json.
// App Token(발신자)은 서버에 하나(env), 받는 사람들의 User Key 는 여기서 목록 관리한다.
// 최초 실행 시 env PUSHOVER_USER_KEY 가 있으면 "기본" 수신자로 시드.
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

export interface Recipient {
  id: string;
  label: string;
  userKey: string;
  enabled: boolean;
}

const FILE = path.join(process.cwd(), "data", "notify-recipients.json");

async function ensure(): Promise<void> {
  try {
    await fs.access(FILE);
  } catch {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    const envKey = process.env.PUSHOVER_USER_KEY?.trim();
    const seed: Recipient[] = envKey
      ? [{ id: randomUUID(), label: "기본(관리자)", userKey: envKey, enabled: true }]
      : [];
    await fs.writeFile(FILE, JSON.stringify(seed, null, 2) + "\n", "utf-8");
  }
}

export async function listRecipients(): Promise<Recipient[]> {
  await ensure();
  try {
    return JSON.parse(await fs.readFile(FILE, "utf-8")) as Recipient[];
  } catch {
    return [];
  }
}

async function write(rs: Recipient[]): Promise<void> {
  await ensure();
  await fs.writeFile(FILE, JSON.stringify(rs, null, 2) + "\n", "utf-8");
}

export async function addRecipient(label: string, userKey: string): Promise<Recipient> {
  const rs = await listRecipients();
  const key = userKey.trim();
  if (rs.some((r) => r.userKey === key)) {
    throw new Error("이미 등록된 User Key 입니다.");
  }
  const r: Recipient = {
    id: randomUUID(),
    label: label.trim() || "이름없음",
    userKey: key,
    enabled: true,
  };
  rs.push(r);
  await write(rs);
  return r;
}

export async function updateRecipient(
  id: string,
  patch: Partial<Omit<Recipient, "id">>,
): Promise<Recipient | null> {
  const rs = await listRecipients();
  const i = rs.findIndex((r) => r.id === id);
  if (i < 0) return null;
  rs[i] = { ...rs[i], ...patch, id };
  await write(rs);
  return rs[i];
}

export async function deleteRecipient(id: string): Promise<boolean> {
  const rs = await listRecipients();
  const next = rs.filter((r) => r.id !== id);
  if (next.length === rs.length) return false;
  await write(next);
  return true;
}

/** 실제 발송 대상 — 활성화된 수신자의 User Key 목록 */
export async function enabledUserKeys(): Promise<string[]> {
  return (await listRecipients()).filter((r) => r.enabled && r.userKey).map((r) => r.userKey);
}

/** UI 표시용 마스킹 (앞4…뒤4) */
export function maskKey(k: string): string {
  return k.length <= 10 ? k : `${k.slice(0, 4)}…${k.slice(-4)}`;
}
