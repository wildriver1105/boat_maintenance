// 버스 기기 이름 — src(주소) → 사람이 붙인 이름.
//
// N2K 버스는 기기 이름을 알려주지 않는다. 주소와 PGN 뿐이라, 무엇이 보내는지로
// 추정할 수는 있지만 추정은 틀린다 — 예를 들어 heading/attitude 를 보내는 것이
// EV-1 센서일 수도, ACU 일 수도 있다. 그래서 **추정은 추정이라고 표시하고**,
// 실제 이름은 사람이 지정해 저장한다.
//
// (버스에는 60928 ISO Address Claim, 126996 Product Information 이 흐르고 있어
//  제조사·모델을 읽어올 여지가 있지만, 지금 게이트웨이 펌웨어는 이 둘을 디코딩
//  하지 않는다. 펌웨어가 디코딩하게 되면 이 파일은 기본값 제공자로 남는다.)

import { promises as fs } from "fs";
import path from "path";

const DATA_FILE = path.join(process.cwd(), "data", "seatalk-devices.json");

export type SeatalkNames = Record<string, string>; // src → 이름

export async function readNames(): Promise<SeatalkNames> {
  try {
    const raw = JSON.parse(await fs.readFile(DATA_FILE, "utf-8"));
    return raw && typeof raw === "object" ? (raw as SeatalkNames) : {};
  } catch {
    return {};
  }
}

export async function setName(src: number, name: string): Promise<SeatalkNames> {
  const names = await readNames();
  const trimmed = name.trim();
  if (trimmed) names[String(src)] = trimmed;
  else delete names[String(src)]; // 빈 이름 = 지정 해제 (추정으로 되돌아간다)
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(names, null, 2) + "\n", "utf-8");
  return names;
}
