---
type: adr
project: Binance-Bollinger-Notice-Bot
id: ADR-003
status: accepted
date: 2026-01-07
tags: [adr, websocket, data-handling, reliability]
---

# ADR-003: WebSocket Data Handling & Candle Confirmation Policy

## Context

본 프로젝트는 **실시간 시장 데이터 수신**이 시스템 전체 품질을 결정하는 구조를 가진다.  
볼린저 밴드와 같은 변동성 지표는 **가격의 순간적 변화에 민감**하며,  
데이터 지연 또는 누락은 잘못된 매매 신호로 직결될 수 있다.

사전 분석 문서에서는 다음 사항이 명확히 제시되었다.

- HTTP Polling 방식은 실시간 전략에 부적합
- Binance WebSocket API는 초저지연 데이터 제공
- 장시간 실행 시 연결 안정성 확보가 필수 :contentReference[oaicite:0]{index=0}

이에 따라 **데이터 수신 방식, 신호 판별 시점, 연결 복구 전략**에 대한 명확한 정책 결정이 필요했다.

---

## Decision

본 프로젝트는 **Binance Futures WebSocket 기반 데이터 수신**을 채택하고,  
**캔들 확정 기준(x = true)** 에서만 전략 연산 및 신호 판별을 수행한다.

### 1. Data Ingestion Policy

- 데이터 소스: **Binance WebSocket (Kline / Candlestick Stream)**
- 대상 데이터:
  - 종가 (Close Price)
  - 캔들 확정 여부 (`x` flag)
- REST API 기반 주기적 조회 방식은 사용하지 않는다

이는 실시간 전략에서 요구되는 **지연 최소화 및 이벤트 기반 처리**를 충족한다 :contentReference[oaicite:1]{index=1}.

---

## Candle Confirmation Policy

### 정책 정의

- **캔들 확정 (`x = true`) 시점에서만**
  - Bollinger Bands 계산
  - Long / Short 진입 신호 판별
- 미확정 캔들(`x = false`)은:
  - 참고용 모니터링 가능
  - 공식 신호 판별에서는 제외

### 결정 사유

- 미확정 캔들은 가격 변동에 따라 지표 값이 지속적으로 변경됨
- 실시간 알림 시스템 특성상:
  - 허위 신호(False Signal)
  - 중복 알림
  - 신뢰도 저하 위험 존재

따라서 **신호의 정확성과 사용자 신뢰도를 우선**하여  
확정 캔들 기준 전략을 채택한다 :contentReference[oaicite:2]{index=2}.

---

## Data Buffering Strategy

- 최근 **N개(Period=20)** 의 종가만 유지
- FIFO(First In, First Out) 구조 적용
- 배열 길이 초과 시:
  - 가장 오래된 데이터 제거

### 목적

- 메모리 누수 방지
- 지표 계산 일관성 유지
- 장시간 실행 환경 안정성 확보

---

## Connection Resilience Policy

Binance WebSocket은 다음 특성을 가진다.

- 약 **24시간마다 연결 강제 종료**
- 네트워크 불안정 시 무음 단절 가능

이에 따라 다음 복원 전략을 적용한다.

### 1. Heartbeat / Watchdog

- 메시지 수신 시 타이머 갱신
- 일정 시간(예: 60초) 동안 이벤트 미수신 시:
  - 연결 이상으로 판단
  - WebSocket 강제 종료 후 재연결

### 2. Auto-Reconnect

- 연결 종료 이벤트 감지 시 자동 재접속
- 재연결 시:
  - 내부 상태 초기화
  - 데이터 버퍼 유지 범위 재검증

### 3. Fail-Safe 원칙

- 데이터 불일치 시 신호 생성 중단
- 안정성 우선, 공격적 재시도 지양

이 정책은 **알림 봇의 신뢰성과 장기 운영 가능성**을 보장한다 :contentReference[oaicite:3]{index=3}.

---

## Alternatives Considered

### REST Polling 기반 처리
- 단점
  - 지연 발생
  - API Rate Limit 리스크
  - 고빈도 전략에 부적합

### Tick 기반 미확정 캔들 전략
- 단점
  - 노이즈 과다
  - 신호 품질 저하
  - 알림 스팸 위험

### 다중 타임프레임 동시 처리
- 단점
  - MVP 범위 초과
  - 복잡도 급증

---

## Consequences

### Positive
- 신호 품질 및 신뢰도 향상
- 중복 알림 및 오탐 감소
- 장시간 무중단 운영 가능

### Trade-offs
- 신호 발생이 캔들 종가 기준으로 다소 지연
- 초단타(Scalping) 전략에는 부적합

---

## Related

- [[ADR-001-Tech-Stack]]
- [[ADR-002-Trading Strategy – Bollinger Bands Mean Reversion with Volatility Filter]]
- [[ADR-004-Notification Debounce & Rate Limit Policy]]
- [[20_System_Design/Market_Data_Consumer]]
- [[00_Map_of_Content]]
