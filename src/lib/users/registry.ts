// 사용자(크루) 레지스트리 — data/users.json 에 파일 저장 (devices 와 동일 패턴).
// 비밀번호는 bcrypt 해시로만 저장. 프로토콜 모드의 "누가 체크했는지" 감사 추적의 기반.
// 추후 SQLite/Prisma 로 승격 시 이 파일만 교체.

import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

export type Role = "admin" | "crew";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  createdAt: string;
}

/** 감사/표시에 안전한 공개 형태 (해시 제외) */
export type PublicUser = Omit<User, "passwordHash">;

const DATA_FILE = path.join(process.cwd(), "data", "users.json");

async function ensureFile(): Promise<void> {
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, "[]\n", "utf-8");
  }
}

async function readAll(): Promise<User[]> {
  await ensureFile();
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, "utf-8")) as User[];
  } catch {
    return [];
  }
}

async function writeAll(users: User[]): Promise<void> {
  await ensureFile();
  await fs.writeFile(DATA_FILE, JSON.stringify(users, null, 2) + "\n", "utf-8");
}

function toPublic(u: User): PublicUser {
  const { passwordHash: _omit, ...rest } = u;
  void _omit;
  return rest;
}

/** 첫 실행 시 관리자 계정이 없으면 기본 관리자를 생성 (env 로 커스터마이즈) */
export async function ensureSeedAdmin(): Promise<void> {
  const users = await readAll();
  if (users.some((u) => u.role === "admin")) return;
  const email = (process.env.AUTH_ADMIN_EMAIL ?? "admin@boat.local").toLowerCase();
  const password = process.env.AUTH_ADMIN_PASSWORD ?? "admin1234";
  const admin: User = {
    id: randomUUID(),
    email,
    name: "관리자",
    role: "admin",
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: new Date().toISOString(),
  };
  users.push(admin);
  await writeAll(users);
}

export async function listUsers(): Promise<PublicUser[]> {
  await ensureSeedAdmin();
  return (await readAll()).map(toPublic);
}

export async function findByEmail(email: string): Promise<User | undefined> {
  await ensureSeedAdmin();
  const norm = email.trim().toLowerCase();
  return (await readAll()).find((u) => u.email === norm);
}

export async function createUser(input: {
  email: string;
  name: string;
  role: Role;
  password: string;
}): Promise<PublicUser> {
  const users = await readAll();
  const email = input.email.trim().toLowerCase();
  if (users.some((u) => u.email === email)) {
    throw new Error("이미 존재하는 이메일입니다.");
  }
  const user: User = {
    id: randomUUID(),
    email,
    name: input.name.trim(),
    role: input.role,
    passwordHash: await bcrypt.hash(input.password, 10),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await writeAll(users);
  return toPublic(user);
}

export async function deleteUser(id: string): Promise<boolean> {
  const users = await readAll();
  const target = users.find((u) => u.id === id);
  if (!target) return false;
  // 마지막 관리자는 삭제 금지
  if (target.role === "admin" && users.filter((u) => u.role === "admin").length <= 1) {
    throw new Error("마지막 관리자 계정은 삭제할 수 없습니다.");
  }
  await writeAll(users.filter((u) => u.id !== id));
  return true;
}

/** 로그인 검증 — 이메일+비밀번호가 맞으면 공개 사용자 반환 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<PublicUser | null> {
  const user = await findByEmail(email);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? toPublic(user) : null;
}
