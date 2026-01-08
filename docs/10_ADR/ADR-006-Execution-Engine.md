---
type: adr
project: Binance-Bollinger-Notice-Bot
id: ADR-006
status: accepted
date: 2026-01-08
tags: [adr, execution, auto-trading, order-management]
---

# ADR-006: Execution Engine - Automated Order Execution

## Context

기존 시스템은 트레이딩 신호를 **알림만 전송**하는 Notice Bot이었다.
사용자 요청에 따라 **자동 주문 실행(Auto Trading)** 기능을 추가하여
신호 발생 시 자동으로 Binance Futures 주문을 실행할 수 있도록 확장한다.

핵심 요구사항:

- Strategy Engine의 신호를 받아 자동으로 주문 실행
- Market Order로 빠른 진입
- Take Profit / Stop Loss 자동 설정
- 포지션 크기의 동적 계산 (계좌 잔고 기반)
- 거래소 규칙(precision, min/max qty) 준수
- Testnet 우선 테스트 지원
- Kill Switch (비활성화 가능)

---

## Decision

다음과 같은 **Execution Engine 아키텍처**를 채택한다.

### Component Structure

```
src/execution/
├── ExecutionEngine.ts      # 주문 실행 오케스트레이션
├── BinanceOrderClient.ts   # Binance API 저수준 래퍼
├── PositionSizer.ts        # 포지션 크기 계산
├── OrderValidator.ts       # 주문 유효성 검증
├── types.ts                # 타입 정의
└── index.ts                # 모듈 exports
```

### Execution Flow

1. **Signal Reception**: Strategy Engine에서 TradingSignal 수신
2. **State Query**: 병렬로 잔고, 포지션, 심볼 정보, 현재가 조회
3. **Position Sizing**: 계좌 잔고 기반 포지션 크기 계산
4. **Validation**: 주문 유효성 검증 (중복 포지션, 최소 금액 등)
5. **Entry Order**: Market Order로 진입
6. **TP/SL Setup**: Take Profit, Stop Loss 조건부 주문 설정

### Position Sizing Formula

```
riskAmount = availableBalance * positionSizePercent
notionalValue = min(riskAmount * leverage, maxPositionSizeUsdt)
quantity = notionalValue / currentPrice
quantity = adjustToPrecision(quantity, symbolInfo)
```

### Configuration

```typescript
interface ExecutionEngineConfig {
  enabled: boolean;           // Kill switch
  testnet: boolean;           // Testnet 사용 여부
  symbol: string;             // 거래 심볼
  leverage: number;           // 레버리지 (1-125)
  positionSizePercent: number; // 잔고 대비 포지션 비율
  takeProfitPercent: number;  // TP 비율 (e.g., 0.02 = 2%)
  stopLossPercent: number;    // SL 비율 (e.g., 0.01 = 1%)
  maxPositionSizeUsdt: number; // 최대 포지션 크기
  minPositionSizeUsdt: number; // 최소 포지션 크기
  retryAttempts: number;      // 재시도 횟수
  retryDelayMs: number;       // 재시도 지연
}
```

### Order Types

| Order | Type | Purpose |
|-------|------|---------|
| Entry | MARKET | 빠른 진입, 슬리피지 허용 |
| Take Profit | TAKE_PROFIT_MARKET | 목표가 도달 시 전체 청산 |
| Stop Loss | STOP_MARKET | 손절가 도달 시 전체 청산 |

### Error Handling

- **Retryable Errors**: 네트워크 오류, Rate Limit → 지수 백오프 재시도
- **Non-retryable Errors**: 잔고 부족, 잘못된 심볼 → 즉시 실패
- **Event Emission**: 모든 결과를 이벤트로 발행

---

## Alternatives Considered

### Limit Order Entry
- 장점: 슬리피지 없음
- 단점: 체결 보장 없음, Mean Reversion 전략에 부적합
- 결정: Market Order 채택

### External Order Management System
- 장점: 기능 풍부
- 단점: 추가 의존성, 복잡성 증가
- 결정: 자체 구현 채택

### Bracket Order API
- Binance Futures는 Bracket Order 미지원
- 결정: Entry + TP/SL 분리 주문

---

## Consequences

### Positive
- 신호 발생 즉시 자동 주문 실행
- 일관된 포지션 사이징
- TP/SL 자동 설정으로 리스크 관리
- Testnet 우선 테스트로 안전한 배포

### Trade-offs
- Market Order로 인한 슬리피지 가능성
- Binance Futures 전용 (다른 거래소 미지원)
- 실시간 인터넷 연결 필수

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| API Key 노출 | 환경 변수 관리, IP 화이트리스트 |
| 과도한 주문 | Kill Switch, Position 중복 검증 |
| 네트워크 장애 | 재시도 로직, 에러 알림 |
| 잔고 부족 | 사전 잔고 검증 |

---

## Related

- [[ADR-001-Tech-Stack]]
- [[ADR-002-Trading Strategy – Bollinger Bands Mean Reversion with Volatility Filter]]
- [[ADR-005-Security & API Key Management Policy]]
- [[ADR-007-Position-Manager]]
- [[ADR-008-Risk-Manager]]
