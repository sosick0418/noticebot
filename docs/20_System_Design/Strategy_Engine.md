---
type: system-design
project: Binance-Bollinger-Notice-Bot
date: 2026-01-07
tags: [system-design, strategy, bollinger-bands]
---

# Strategy Engine

## Overview

Strategy Engine은 본 시스템의 **핵심 두뇌(Core Logic Layer)** 로서  
Market Data Consumer로부터 전달받은 **확정된 캔들 데이터**를 기반으로  
볼린저 밴드 전략을 계산하고 **Long / Short 진입 신호를 판별**한다.

본 모듈은 다음 ADR 결정에 근거하여 설계되었다.

- [[ADR-001-Tech-Stack]]
- [[ADR-002-Trading Strategy – Bollinger Bands Mean Reversion with Volatility Filter]]
- [[ADR-003-WebSocket Data Handling & Candle Confirmation Policy]]
- [[ADR-004-Notification Debounce & Rate Limit Policy]]

---

## Responsibilities

Strategy Engine의 책임은 다음과 같다.

1. 종가 데이터 버퍼 관리
2. Bollinger Bands 실시간 계산
3. Mean Reversion 기반 진입 조건 판별
4. Volatility Filter 적용
5. 유효한 신호를 Notification Service로 전달

> ❗ Market Data 수신 및 알림 전송은 이 모듈의 책임이 아니다.

---

## Input Contract

### Incoming Event

Market Data Consumer로부터 다음 이벤트를 수신한다.

```ts
onCandleClosed({
  closePrice: number,
  closeTime: number
})
````

### Pre-condition

- 캔들은 반드시 확정 상태 (`x === true`)
    
- closePrice는 number 타입으로 정규화됨
    

---

## Indicator Configuration

### Bollinger Bands Parameters

|Parameter|Value|
|---|---|
|Period|20|
|StdDev|2|
|Price Type|Close Price|

해당 파라미터는 TradingView 등 외부 차트 기준과의 일관성을 유지하기 위함이다.

---

## Data Buffer Management

- 최근 **20개 종가**만 유지
    
- FIFO 구조
    

```ts
closePrices.push(closePrice)
if (closePrices.length > PERIOD) {
  closePrices.shift()
}
```

### Guard Condition

- 데이터 개수가 Period 미만일 경우:
    
    - 지표 계산 및 신호 판별 수행하지 않음
        

---

## Signal Evaluation Logic

### Long Entry Signal

- 조건:
    
    - `closePrice ≤ lowerBand`
        
- 의미:
    
    - 통계적 과매도(Oversold)
        
    - 평균 회귀 가능성 증가
        

### Short Entry Signal

- 조건:
    
    - `closePrice ≥ upperBand`
        
- 의미:
    
    - 통계적 과매수(Overbought)
        

---

## Volatility Filter

볼린저 밴드 전략의 대표적인 리스크인  
**Band Walking** 및 **False Reversion**을 완화하기 위해  
변동성 필터를 적용한다.

### Bandwidth Calculation

```ts
bandwidth = (upperBand - lowerBand) / middleBand
```

### Filtering Policy

- Bandwidth가 설정된 임계값 이하일 경우:
    
    - ❌ Mean Reversion 진입 신호 무효화
        
    - ⭕ 추세 발생 가능성 참고 상태로 처리 (확장 가능)
        

### Optional RSI Filter

- Long:
    
    - RSI ≤ 30
        
- Short:
    
    - RSI ≥ 70
        

RSI는 **보조 지표(Optional)** 로 사용하며  
초기 MVP에서는 필수 조건이 아니다.

---

## Signal Emission

조건을 만족하는 경우,  
Strategy Engine은 다음 이벤트를 방출한다.

```ts
onSignalDetected({
  type: "LONG" | "SHORT",
  symbol: string,
  closePrice: number,
  bandValue: number,
  timestamp: number
})
```

> ❗ Strategy Engine은  
> **알림 포맷팅이나 중복 제어를 수행하지 않는다.**

(근거: [[ADR-004-Notification-Debounce-Policy]])

---

## State Management

Strategy Engine은 **휘발성 상태(In-Memory)** 만 유지한다.

- 최근 종가 배열
    
- 마지막 처리 캔들 timestamp
    

### Non-Persistence Policy

- 재시작 시 상태 초기화
    
- 중복 알림 제어는 Notification Service에서 처리
    

---

## Error Handling

- 지표 계산 실패 시:
    
    - 해당 캔들 무시
        
    - 다음 이벤트 처리 계속
        
- 데이터 불일치 감지 시:
    
    - 신호 생성 중단
        

---

## Non-Goals

Strategy Engine은 다음을 수행하지 않는다.

- WebSocket 연결 관리
    
- 데이터 수집
    
- 알림 전송
    
- 주문 실행
    
- 데이터베이스 저장
    

---

## Related

- [[ADR-002-Trading Strategy – Bollinger Bands Mean Reversion with Volatility Filter]]
    
- [[ADR-004-Notification Debounce & Rate Limit Policy]]
    
- [[20_System_Design/Market_Data_Consumer]]
    
- [[20_System_Design/Notification_Service]]
    
- [[00_Map_of_Content]]