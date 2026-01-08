---
type: adr
project: Binance-Bollinger-Notice-Bot
id: ADR-007
status: accepted
date: 2026-01-08
tags: [adr, position-management, real-time-tracking, dashboard]
---

# ADR-007: Position Manager - Real-time Position Tracking

## Context

자동 매매 시스템 도입에 따라 **실시간 포지션 상태 추적**이 필요하다.
Dashboard 및 Risk Manager에서 현재 포지션 정보를 활용하기 위해
독립적인 Position Manager 모듈을 구축한다.

핵심 요구사항:

- 실시간 포지션 상태 조회 (크기, 진입가, 방향)
- ROE (Return on Equity) 계산
- 청산가(Liquidation Price) 추정
- 계좌 잔고 및 마진 상태 추적
- 포지션 변경 이벤트 발행 (opened, closed, updated)
- Dashboard 연동을 위한 폴링 기반 업데이트

---

## Decision

다음과 같은 **Position Manager 아키텍처**를 채택한다.

### Component Structure

```
src/position/
├── PositionManager.ts   # 포지션 추적 및 이벤트 발행
├── types.ts             # 타입 정의
└── index.ts             # 모듈 exports
```

### Data Model

#### ExtendedPosition
기본 포지션 정보에 계산된 필드 추가:

```typescript
interface ExtendedPosition {
  symbol: string;
  side: 'LONG' | 'SHORT' | 'NONE';
  size: number;           // 포지션 수량
  entryPrice: number;     // 진입가
  unrealizedPnl: number;  // 미실현 손익
  leverage: number;       // 레버리지

  // Extended fields
  markPrice: number;      // 현재 마크 가격
  roe: number;            // ROE (%)
  liquidationPrice: number; // 청산가
  margin: number;         // 사용 마진
  lastUpdate: number;     // 마지막 업데이트 시간
}
```

#### AccountSummary
계좌 전체 상태 요약:

```typescript
interface AccountSummary {
  totalBalance: number;      // 총 잔고
  availableBalance: number;  // 사용 가능 잔고
  totalUnrealizedPnl: number; // 총 미실현 손익
  totalMargin: number;       // 사용 마진
  marginRatio: number;       // 마진 비율
  lastUpdate: number;        // 마지막 업데이트 시간
}
```

### Polling Strategy

WebSocket User Data Stream 대신 **REST API 폴링**을 채택:

| 항목 | 설계 |
|------|------|
| 방식 | Periodic REST API Polling |
| 주기 | 5초 (설정 가능) |
| 데이터 | Position + Balance + Mark Price |
| 병렬 처리 | Promise.all로 동시 요청 |

#### Rationale
- User Data Stream은 추가 인증 및 Keep-alive 관리 필요
- 5초 폴링으로 충분한 실시간성 확보
- 구현 복잡도 감소

### ROE & Liquidation Calculation

#### ROE (Return on Equity)
```
ROE = (unrealizedPnl / margin) * 100
margin = notionalValue / leverage
```

#### Liquidation Price (Simplified)
```
LONG:  entry * (1 - 1/leverage + maintenanceMarginRate)
SHORT: entry * (1 + 1/leverage - maintenanceMarginRate)
```

> Note: 실제 청산가는 더 복잡한 요소(funding, fees) 포함.
> 이 계산은 **추정치**로 Dashboard 표시용.

### Event System

```typescript
type PositionManagerEvents = {
  positionChanged: [change: PositionChange];
  accountUpdated: [account: AccountSummary];
  error: [error: Error];
};

interface PositionChange {
  previous: ExtendedPosition | null;
  current: ExtendedPosition | null;
  changeType: 'opened' | 'closed' | 'updated' | 'none';
}
```

### Change Detection

변경 감지 기준:
- Position Side 변경
- Position Size 변경
- Unrealized PnL 변경 (> 0.01 USDT threshold)

---

## Alternatives Considered

### Binance User Data Stream (WebSocket)
- 장점: 실시간 푸시
- 단점: Listen Key 관리, Keep-alive 필요, 추가 복잡성
- 결정: 폴링 방식 채택 (5초 주기로 충분)

### 이벤트 기반 On-demand Query
- 장점: API 호출 최소화
- 단점: Dashboard 실시간 업데이트 불가
- 결정: 폴링 방식 채택

### Execution Engine 통합
- 장점: 코드 중복 감소
- 단점: 책임 분리 위반, 모듈 비대화
- 결정: 별도 모듈로 분리

---

## Consequences

### Positive
- 실시간 포지션 상태 모니터링
- Dashboard 연동 용이
- Risk Manager와의 데이터 공유
- 포지션 변경 시 즉각적인 이벤트 발행

### Trade-offs
- 5초 폴링으로 인한 약간의 지연
- 추가 API 호출 (Rate Limit 고려 필요)
- 청산가 계산은 추정치

### API Rate Limit Consideration

| Endpoint | Weight | 호출 주기 |
|----------|--------|----------|
| GET /fapi/v2/positionRisk | 5 | 5초 |
| GET /fapi/v2/balance | 5 | 5초 |
| GET /fapi/v1/premiumIndex | 1 | 5초 |

총 요청: 11 weight / 5초 = 132 weight/분
Binance 제한: 1200 weight/분 → **안전 범위 내**

---

## Related

- [[ADR-006-Execution-Engine]]
- [[ADR-008-Risk-Manager]]
- [[20_System_Design/Dashboard]]
