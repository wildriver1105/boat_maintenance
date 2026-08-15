#!/bin/bash
# resonance.local 을 이 머신의 mDNS 이름으로 광고한다.
#
# macOS 는 LocalHostName 하나만 자동 광고하므로(현재 Hanulianui-Macmini.local),
# 추가 이름은 dns-sd 프록시 등록으로 붙인다. 머신 이름 자체는 바꾸지 않으므로
# 기존 서비스(signalk 등)에 영향이 없다. sudo 불필요.
#
# dns-sd -P 는 IP 를 인자로 받으므로 실행 시점의 활성 IP 를 찾아 넘긴다.
# 포그라운드로 계속 떠 있어야 등록이 유지된다 → LaunchAgent 가 KeepAlive 로 관리.

set -u

NAME="${MDNS_NAME:-resonance}"
PORT="${MDNS_PORT:-3100}"

# 활성 인터페이스의 IPv4 주소 찾기.
#
# ⚠ "첫 번째 IP" 를 그냥 고르면 안 된다. 하드웨어 포트 순서상 이더넷(en0)이
#    Wi-Fi(en1)보다 앞인데, en0 는 RayNet(198.18.x.x — 레이마린 장비만 있는
#    격리망)에 물려 있다. 그 주소로 광고하면 nav.local 이 **아무도 닿을 수 없는
#    주소**를 가리켜 "열리지 않는" 증상이 난다(실제로 발생했다).
#
# 그래서 클라이언트(노트북·폰)가 실제로 있는 망의 주소만 고른다.
is_usable_ip() {
  case "${1:-}" in
    ""|127.*|169.254.*|198.18.*) return 1 ;;   # 링크로컬·RayNet 제외
    *) return 0 ;;
  esac
}

find_ip() {
  local def_iface ip
  # 1순위: 기본 경로가 나가는 인터페이스 — 선박 LAN/Wi-Fi 가 여기다.
  def_iface=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
  if [ -n "${def_iface:-}" ]; then
    ip=$(ipconfig getifaddr "$def_iface" 2>/dev/null)
    if is_usable_ip "${ip:-}"; then echo "$ip"; return 0; fi
  fi
  # 2순위: 제외 대상이 아닌 첫 인터페이스
  for iface in $(networksetup -listallhardwareports 2>/dev/null | awk '/Device:/{print $2}'); do
    ip=$(ipconfig getifaddr "$iface" 2>/dev/null)
    if is_usable_ip "${ip:-}"; then echo "$ip"; return 0; fi
  done
  return 1
}

IP="$(find_ip)"
if [ -z "${IP:-}" ]; then
  echo "[mdns] 활성 IP 를 찾지 못했습니다. 30초 후 재시도합니다." >&2
  sleep 30
  exit 1   # KeepAlive 가 재실행 → 네트워크가 붙으면 성공
fi

echo "[mdns] ${NAME}.local → ${IP}:${PORT} 광고 시작"

# ⚠ exec 로 붙박이면 안 된다 — 망이 바뀌어도(선박 LAN→핫스팟) dns-sd 는 안 죽고
#   **옛 IP 를 계속 광고**한다(실측 2026-08-15: 접속 불가 원인). 백그라운드로 띄우고
#   30초마다 IP 를 재확인해, 바뀌었으면 종료 → KeepAlive 가 새 IP 로 다시 광고한다.
/usr/bin/dns-sd -P "$NAME" _http._tcp local "$PORT" "${NAME}.local" "$IP" &
DNSSD_PID=$!
trap 'kill "$DNSSD_PID" 2>/dev/null' EXIT

while sleep 30; do
  if ! kill -0 "$DNSSD_PID" 2>/dev/null; then
    echo "[mdns] dns-sd 가 죽었습니다 — 재시작" >&2
    exit 1
  fi
  NOW="$(find_ip || true)"
  if [ -n "${NOW:-}" ] && [ "$NOW" != "$IP" ]; then
    echo "[mdns] IP 변경 감지 ${IP} → ${NOW} — 재등록" >&2
    exit 1
  fi
done
