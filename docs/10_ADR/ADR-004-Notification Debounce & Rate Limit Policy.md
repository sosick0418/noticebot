---
type: adr
project: Binance-Bollinger-Notice-Bot
id: ADR-004
status: accepted
date: 2026-01-07
tags: [adr, notification, debounce, rate-limit]
---

# ADR-004: Notification Debounce & Rate Limit Policy

## Context

본 프로젝트는 **자동 매매가 아닌 알림(Notice) 중심 시스템**이다.  
따라서 알림의 “속도”보다 더 중요한 것은 **신뢰도와 가독성**이다.

실시간 시세 환경에서는 다음과 같은 문제가 빈번히 발생할 수 있다.

- 동일 캔들 내에서 신호 조건이 반복 충족
- WebSocket 재연결 시 과거 데이터 재수신
- 가격이 밴드 경계에서 미세하게 진동하며 다중 신호 발생
- 메신저 플랫폼(Telegram)의 Rate Limit 초과

사전 분석 문서에서도 **과도한 알림은 사용자 경험을 심각하게 저해**하며,  
메시지 전송 제한을 고려한 정책 수립의 필요성이 강조되었다 :contentReference[oaicite:0]{index=0}.

---

## Decision

본 프로젝트는 **알림 품질을 최우선**으로 하여  
다음과 같은 **Debounce 및 Rate Limit 정책**을 채택한다.

### 핵심 원칙

> **“하나의 캔들에서 하나의 의미 있는 알림만 전달한다.”**

---

## Notification Debounce Policy

### 1. Candle-based Debounce

- 알림은 **캔들 확정(x = true)** 기준으로만 발생
- 동일 캔들(동일 timestamp)에서는:
  - ❌ 중복 알림 금지
  - ⭕ 최초 1회 알림만 허용

### 2. Signal State Tracking

- 다음 상태 정보를 메모리에 유지한다.
  - 마지막 알림 캔들 timestamp
  - 마지막 알림 타입 (LONG / SHORT)
- 동일 캔들 + 동일 타입 신호 발생 시:
  - 알림 생략

### 3. 목적

- 알림 스팸 방지
- 사용자 혼란 최소화
- 전략 신호의 “결정적 순간”만 전달

---

## Rate Limit Policy (Telegram)

Telegram Bot API는 다음과 같은 제약을 가진다.

- **초당 약 30건 메시지 제한**
- 단시간 대량 전송 시:
  - 메시지 누락
  - 봇 일시 제한 가능성

이에 따라 다음 정책을 적용한다.

### 1. Message Throttling

- 알림 메시지는 즉시 전송하되,
- 내부적으로:
  - 짧은 딜레이 큐(Queue) 적용 가능
  - 연속 전송 방지

### 2. Critical Error Notification 분리

- 일반 신호 알림과:
  - 시스템 오류 알림(API 인증 실패 등)을 분리
- 오류 알림은:
  - 우선순위 높음
  - 빈도 제한 적용

---

## Notification Content Policy

알림 메시지는 다음 기준을 충족해야 한다.

- 한 눈에 전략 상황 파악 가능
- 불필요한 정보 배제
- 모바일 환경 최적화

### 기본 메시지 구성

- 포지션 타입: LONG / SHORT
- 거래쌍 (예: BTCUSDT)
- 현재가
- 기준 밴드 값
- 신호 발생 시간

Markdown 포맷을 활용하여  
중요 정보가 자연스럽게 강조되도록 구성한다 :contentReference[oaicite:1]{index=1}.

---

## Alternatives Considered

### 모든 Tick 기반 실시간 알림
- 단점
  - 알림 폭주
  - 사용자 즉시 차단 가능성
  - 알림 의미 상실

### 전략 조건 충족 시마다 무제한 전송
- 단점
  - Telegram Rate Limit 초과
  - 신뢰도 급락

### 서버 재시작 시 상태 초기화 없음
- 단점
  - 중복 알림 발생 가능

---

## Consequences

### Positive
- 알림 신뢰도 대폭 향상
- 사용자 피로도 감소
- 장기 사용에 적합한 알림 품질 확보
- Telegram API 안정성 보장

### Trade-offs
- 일부 미세한 진입 기회 알림 누락 가능
- 초단타 전략에는 부적합

---

## Related

- [[ADR-001-Tech-Stack]]
- [[ADR-002-Strategy-Logic-Bollinger-Bands]]
- [[ADR-003-WebSocket-Data-Handling]]
- [[20_System_Design/Notification_Service]]
- [[00_Map_of_Content]]
