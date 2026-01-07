---
type: adr
project: Binance-Bollinger-Notice-Bot
id: ADR-005
status: accepted
date: 2026-01-07
tags: [adr, security, api-key, operations]
---

# ADR-005: Security & API Key Management Policy

## Context

본 프로젝트는 **외부 금융 시스템(Binance Futures API)** 과 직접 통신하며,  
API Key 유출 시 **실질적인 금전적 손실**로 이어질 수 있는 구조를 가진다.

특히 본 봇은:
- 24시간 상시 실행
- 서버(VPS / EC2) 환경에서 장기 운영
- WebSocket + REST API 혼용

이라는 특성을 가지므로,  
**보안과 운영 리스크 관리가 기능 구현만큼 중요**하다.

사전 분석 문서에서는 API 키 관리, IP 제한, 오류 처리 부재가  
자동화 트레이딩 시스템의 대표적 실패 원인임을 지적하고 있다 :contentReference[oaicite:0]{index=0}.

---

## Decision

본 프로젝트는 다음과 같은 **보안 및 운영 정책**을 채택한다.

### 핵심 원칙

> **“API Key는 코드가 아니라 환경에 존재한다.”**

---

## API Key Management Policy

### 1. Environment Variable 사용

- 모든 민감 정보는 `.env` 파일로 관리
  - `BINANCE_API_KEY`
  - `BINANCE_API_SECRET`
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_CHAT_ID`
- 소스 코드에 하드코딩 금지
- `.env` 파일은 반드시 `.gitignore`에 포함

### 2. 환경 분리

- 테스트넷(Testnet)과 메인넷(Mainnet) 키 분리
- 개발/운영 환경 간 키 공유 금지

---

## Binance API Security Policy

### 1. IP Whitelist 적용

- Binance API 관리 콘솔에서:
  - 봇이 실행되는 서버의 **고정 IP만 허용**
- 허용되지 않은 IP에서의 요청 차단

### 2. 최소 권한 원칙

- 초기 버전(Notice Bot)에서는:
  - ❌ 주문 실행 권한 비활성화
  - ⭕ 조회(Read) 권한만 사용 가능
- 자동 매매 기능 도입 시:
  - 별도 키 발급
  - 권한 단계적 확장

---

## Error Handling & Fail-Safe Policy

### 1. API Error Handling

- 모든 외부 API 호출은 `try-catch`로 감쌈
- 인증 실패, 네트워크 오류 발생 시:
  - 즉시 전략 실행 중단
  - 로그 기록

### 2. Fatal Error Notification

- 치명적 오류 발생 시:
  - Telegram을 통해 관리자에게 즉시 알림
- 사용자 신호 알림과 구분된 포맷 사용

---

## Logging & Operational Visibility

### 1. Structured Logging

- `winston` 등 로깅 라이브러리 사용
- 로그 레벨 구분:
  - info / warn / error
- 로그 파일 일 단위 로테이션

### 2. 민감 정보 마스킹

- 로그에 API Key, Secret 절대 출력 금지
- 에러 객체 출력 시:
  - 필요 최소 정보만 기록

---

## Process-Level Security

### 1. Process Manager

- **PM2**를 통해 프로세스 관리
- 비정상 종료 시 자동 재시작
- 서버 재부팅 시 자동 실행 설정

### 2. 상태 불일치 방지

- 재시작 시:
  - 알림 상태 초기화
  - 중복 알림 방지 로직 재설정

---

## Alternatives Considered

### 코드 내 암호화 저장
- 단점
  - 복호화 키 노출 위험
  - 근본적 해결 아님

### 하나의 API Key로 모든 권한 관리
- 단점
  - 공격 시 피해 규모 증가
  - 운영 리스크 과다

### 로깅 없는 무상태 운영
- 단점
  - 장애 원인 추적 불가
  - 운영 불가능 수준

---

## Consequences

### Positive
- API Key 유출 리스크 최소화
- 운영 환경에서의 사고 대응 가능
- 자동 매매 확장 시 보안 기반 확보

### Trade-offs
- 초기 설정 복잡도 증가
- 운영 서버 IP 변경 시 재설정 필요

---

## Related

- [[ADR-001-Tech-Stack]]
- [[ADR-003-WebSocket-Data-Handling]]
- [[ADR-004-Notification-Debounce-Policy]]
- [[20_System_Design/Environment_Setup]]
- [[00_Map_of_Content]]
