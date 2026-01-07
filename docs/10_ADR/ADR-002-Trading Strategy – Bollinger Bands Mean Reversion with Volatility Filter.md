---
type: adr
project: Binance-Bollinger-Notice-Bot
id: ADR-002
status: accepted
date: 2026-01-07
tags: [adr, trading-strategy, bollinger-bands]
---

# ADR-002: Trading Strategy – Bollinger Bands Mean Reversion with Volatility Filter

## Context

본 프로젝트의 핵심 가치는 **사용자가 직접 차트를 보지 않아도**  
통계적으로 유의미한 Long / Short 진입 시점을 **실시간으로 인지**할 수 있도록 돕는 데 있다.

이를 위해 다음 조건을 만족하는 전략이 필요했다.

- 실시간 연산이 가능할 것
- 단순하지만 직관적인 해석이 가능할 것
- 알림 기반(Notice Bot)에 적합할 것
- 추후 자동 매매(Execution Bot)로 확장 가능할 것

사전 분석 문서에서는 **볼린저 밴드(Bollinger Bands)** 가  
평균 회귀(Mean Reversion)와 변동성 돌파(Volatility Breakout)  
두 가지 시장 국면을 모두 포착할 수 있는 지표임을 확인하였다 :contentReference[oaicite:0]{index=0}.

---

## Decision

본 프로젝트의 기본 매매(진입) 전략으로  
**볼린저 밴드 기반 Mean Reversion 전략을 채택**하되,  
**변동성 필터링 로직을 함께 적용**한다.

### 1. 기본 전략 방향

- **Mean Reversion (평균 회귀)** 전략 채택
- 가격이 통계적 범위를 벗어났을 때,  
  다시 중심선(SMA)으로 되돌아올 확률에 기반

### 2. Bollinger Bands 파라미터

- 기간 (Period): **20**
- 표준편차 배수 (StdDev): **2**
- 기준 가격: **종가(Close Price)**

이는 일반적으로 가장 널리 사용되며,  
TradingView 등 외부 차트와의 일관성을 확보할 수 있다 :contentReference[oaicite:1]{index=1}.

---

## Signal Definition

### Long 진입 신호

- 현재 캔들의 **종가 ≤ 하단 밴드(Lower Band)**
- 통계적 과매도(Oversold) 상태로 해석
- 평균 회귀 가능성 증가

### Short 진입 신호

- 현재 캔들의 **종가 ≥ 상단 밴드(Upper Band)**
- 통계적 과매수(Overbought) 상태로 해석

### 캔들 기준

- **캔들 확정(x = true)** 시점만 신호 판별
- 미확정 캔들은 노이즈로 간주

---

## Volatility Filter (Risk Control)

볼린저 밴드 전략의 대표적 리스크는  
**밴드 타기(Band Walking)** 현상이다.

이를 완화하기 위해 **변동성 필터링 로직**을 포함한다.

### 1. Band Squeeze 감지

- 볼린저 밴드 폭(Bandwidth)이
  과거 대비 **비정상적으로 좁아진 상태**
- 이 구간에서의 밴드 돌파는
  평균 회귀가 아닌 **강한 추세 시작 신호**일 가능성 존재

### 2. 필터링 정책

- Bandwidth가 임계값 이하일 경우:
  - ❌ 역추세(Mean Reversion) 알림 비활성화
  - ⭕ 추세 발생 가능성에 대한 참고 알림으로 전환 가능 (후속 확장)

### 3. 보조 지표 (Optional)

- RSI 보조 조건:
  - Long: RSI ≤ 30
  - Short: RSI ≥ 70

RSI는 **2차 검증용(Optional)** 으로만 사용하며  
초기 버전에서는 필수 조건으로 강제하지 않는다 :contentReference[oaicite:2]{index=2}.

---

## Alternatives Considered

### Pure Breakout Strategy
- 장점
  - 강한 추세 수익 가능
- 단점
  - 알림 봇 특성상 진입 지연 위험
  - 허위 돌파(False Breakout) 빈번

### Multiple Indicator Strategy (MACD, EMA 등 혼합)
- 장점
  - 조건 정밀도 증가
- 단점
  - 알림 과도
  - 해석 복잡성 증가
  - 초기 MVP 범위 초과

### Tick-based Strategy
- 단점
  - 노이즈 과다
  - 시스템 복잡성 급증

---

## Consequences

### Positive
- 전략 해석이 직관적
- 사용자 학습 비용 낮음
- 실시간 알림에 최적화
- 자동 매매로 자연스럽게 확장 가능

### Trade-offs
- 횡보장에 유리, 강한 추세장에서는 신호 실패 가능
- Bandwidth 임계값 튜닝 필요

---

## Related

- [[ADR-001-Tech-Stack]]
- [[ADR-003-WebSocket Data Handling & Candle Confirmation Policy]]
- [[20_System_Design/Strategy_Engine]]
- [[00_Map_of_Content]]
