# Operations Guide

Binance Bollinger Notice Bot 운영 가이드

---

## 실행 방법

### 개발 모드 (Hot Reload)
```bash
npm run dev
```
- 파일 변경 시 자동 재시작
- 디버깅에 적합

### 프로덕션 모드 (백그라운드)
```bash
nohup npx tsx src/index.ts > logs/app.log 2>&1 &
```
- 터미널 종료해도 계속 실행
- PID가 출력됨

### 빌드 후 실행
```bash
npm run build
npm start
```

---

## 프로세스 관리

### 실행 중인 봇 확인
```bash
ps aux | grep tsx
```

### 봇 종료
```bash
# PID로 종료
kill <PID>

# 또는 모든 tsx 프로세스 종료
pkill -f "tsx src/index.ts"
```

### 강제 종료
```bash
kill -9 <PID>
```

---

## 로그 확인

### 실시간 로그 보기
```bash
tail -f logs/app.log
```

### 최근 로그 확인
```bash
# 최근 100줄
tail -100 logs/app.log

# 에러만 보기
grep "error" logs/app.log

# 시그널만 보기
grep "Signal" logs/app.log
```

### 통합 로그 파일
```bash
tail -f logs/combined.log
```

### 에러 로그만 보기
```bash
tail -f logs/error.log
```

---

## 환경 설정

### .env 파일 주요 설정
| 변수 | 설명 | 예시 |
|------|------|------|
| `INTERVAL` | 캔들 주기 | `15m`, `1m`, `4h` |
| `SYMBOL` | 거래 심볼 | `BTCUSDT` |
| `BB_PERIOD` | 볼린저 밴드 기간 | `20` |
| `BB_STD_DEV` | 표준편차 배수 | `2` |
| `BANDWIDTH_THRESHOLD` | 스퀴즈 임계값 | `0.04` (4%) |
| `BINANCE_TESTNET` | 테스트넷 사용 | `true` / `false` |
| `LOG_LEVEL` | 로그 레벨 | `debug`, `info`, `warn`, `error` |

### 설정 변경 후
봇을 재시작해야 적용됩니다:
```bash
pkill -f "tsx src/index.ts"
nohup npx tsx src/index.ts > logs/app.log 2>&1 &
```

---

## 트러블슈팅

### 봇이 시작되지 않을 때
1. 환경 변수 확인: `.env` 파일 존재 여부
2. 의존성 설치: `npm install`
3. 로그 확인: `tail -50 logs/app.log`

### 알림이 오지 않을 때
1. 텔레그램 설정 확인 (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`)
2. 로그에서 Strategy evaluation 확인
3. Squeeze 상태인지 확인 (bandwidth < 4%)

### WebSocket 연결 실패
1. 네트워크 상태 확인
2. Binance API 상태 확인
3. testnet 설정 확인

---

## 모니터링

### 현재 상태 확인 (로그에서)
```bash
grep "Application status" logs/app.log | tail -1
```

출력 예시:
```json
{"isRunning":true,"isConnected":true,"bufferLength":24}
```

### 전략 평가 확인
```bash
grep "Strategy evaluation" logs/app.log | tail -5
```

---

## PM2 사용 (선택사항)

### PM2 전역 설치
```bash
npm install -g pm2
```

### PM2로 시작
```bash
pm2 start ecosystem.config.cjs
```

### PM2 명령어
```bash
pm2 list          # 프로세스 목록
pm2 logs          # 로그 보기
pm2 restart all   # 재시작
pm2 stop all      # 중지
pm2 delete all    # 삭제
```
