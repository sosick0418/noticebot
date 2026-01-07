---
type: system-design
project: Binance-Bollinger-Notice-Bot
date: 2026-01-07
tags: [system-design, websocket, market-data]
---

# Market Data Consumer

## Overview

Market Data Consumer는 본 시스템의 **입력 레이어(Input Layer)** 로서  
Binance Futures WebSocket으로부터 실시간 시장 데이터를 수신하고,  
전략 엔진이 사용할 수 있는 **정제된 캔들 데이터 스트림**을 제공한다.

본 모듈의 설계는 다음 ADR 결정에 기반한다.

- [[ADR-001-Tech-Stack]]
- [[ADR-003-WebSocket-Data-Handling]]

---

## Responsibilities

Market Data Consumer는 다음 책임을 가진다.

1. Binance Futures WebSocket 연결 관리
2. Kline(Candlestick) 데이터 수신
3. 캔들 확정 여부 판별 (`x = true`)
4. 전략 엔진으로 전달할 데이터 정제
5. 연결 복구 및 안정성 유지

> ❗ 지표 계산 및 매매 신호 판단은 이 모듈의 책임이 아니다.

---

## Data Source

### Exchange
- Binance USDⓈ-M Futures

### Stream Type
- Kline (Candlestick Stream)

### Subscription Parameters
- Symbol: 설정값 (예: BTCUSDT)
- Interval: 설정값 (예: 1m, 5m)

---

## Inbound Data Structure (Simplified)

```json
{
  "k": {
    "t": 1700000000000,
    "T": 1700000059999,
    "c": "42950.12",
    "x": true
  }
}
````

### Key Fields Used

|Field|Description|
|---|---|
|`k.c`|종가 (Close Price)|
|`k.x`|캔들 확정 여부|
|`k.T`|캔들 종료 시간|

---

## Candle Handling Policy

### Confirmation Rule

- `x === true` 인 경우에만:
    
    - 캔들 확정 처리
        
    - 전략 엔진으로 이벤트 전달
        

### Rationale

- 미확정 캔들은 가격이 지속적으로 변동
    
- 허위 신호 및 중복 알림 발생 가능성
    
- 신호 신뢰도 저하 위험
    

(근거: [[ADR-003-WebSocket-Data-Handling]])

---

## Data Buffering Strategy

- 최근 **N개(기본 20개)** 종가만 유지
    
- FIFO 방식 사용
    

```ts
closePrices.push(closePrice)
if (closePrices.length > PERIOD) {
  closePrices.shift()
}
```

### 목적

- Bollinger Bands 계산 안정성 확보
    
- 메모리 사용량 제한
    
- 장시간 실행 환경 대응
    

---

## Event Emission

Market Data Consumer는 전략 엔진과 **이벤트 기반 인터페이스**로 통신한다.

### Emitted Event

```ts
onCandleClosed({
  closePrice: number,
  closeTime: number
})
```

> ❗ 본 모듈은 데이터를 전달할 뿐,  
> 신호 해석이나 판단을 수행하지 않는다.

---

## Connection Resilience

### WebSocket Lifecycle

1. Connect
    
2. Subscribe
    
3. Receive data
    
4. Detect failure
    
5. Reconnect
    

### Heartbeat / Watchdog

- 메시지 수신 시 타이머 갱신
    
- 일정 시간 무응답 시:
    
    - 연결 종료
        
    - WebSocket 재연결 수행
        

---

## Error Handling

- JSON 파싱 실패 → 해당 메시지 무시
    
- WebSocket 오류 → 재연결 시도
    
- 재연결 중:
    
    - 전략 엔진으로 이벤트 전달 중단
        

---

## Non-Goals

Market Data Consumer는 다음을 수행하지 않는다.

- 지표 계산
    
- 매매 신호 판단
    
- 알림 전송
    
- 영속적 상태 저장(DB)

---

## Related

- [[ADR-003-WebSocket-Data-Handling]]
    
- [[20_System_Design/Strategy_Engine]]
    
- [[00_Map_of_Content]]