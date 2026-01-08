---
type: adr
project: Binance-Bollinger-Notice-Bot
id: ADR-008
status: accepted
date: 2026-01-08
tags: [adr, risk-management, trading-limits, safety]
---

# ADR-008: Risk Manager - Trading Risk Monitoring & Limits

## Context

자동 매매 시스템에서 **리스크 관리**는 필수적이다.
과도한 손실을 방지하고 안전한 트레이딩을 보장하기 위해
독립적인 Risk Manager 모듈을 구축한다.

핵심 요구사항:

- 일일 손실 한도 (Daily Loss Limit)
- 최대 드로다운 (Maximum Drawdown)
- 한도 초과 시 거래 차단 (Trading Block)
- 자동 포지션 청산 옵션 (Auto-close)
- 실시간 리스크 상태 모니터링
- 일일 통계 추적 (거래 횟수, 실현 손익)

---

## Decision

다음과 같은 **Risk Manager 아키텍처**를 채택한다.

### Component Structure

```
src/risk/
├── RiskManager.ts   # 리스크 모니터링 및 제한 적용
├── types.ts         # 타입 정의
└── index.ts         # 모듈 exports
```

### Risk Metrics

#### Daily Loss Limit
```
dailyPnl = currentBalance - dayStartBalance + realizedPnl
isDailyLimitBreached = dailyPnl < -dailyLossLimitUsdt
```

- **절대값 기반**: 일일 최대 손실 USDT 금액
- **UTC 기준 리셋**: 매일 00:00 UTC에 자동 리셋
- **초과 시**: 거래 차단, 선택적 포지션 청산

#### Maximum Drawdown
```
currentDrawdown = (peakBalance - currentBalance) / peakBalance
isDrawdownBreached = currentDrawdown > maxDrawdownPercent
```

- **퍼센트 기반**: 최고점 대비 하락률
- **Peak Balance 추적**: 새로운 최고점 자동 갱신
- **초과 시**: 거래 차단, 선택적 포지션 청산

### Configuration

```typescript
interface RiskManagerConfig {
  enabled: boolean;           // 리스크 관리 활성화
  dailyLossLimitUsdt: number; // 일일 손실 한도 (USDT)
  maxDrawdownPercent: number; // 최대 드로다운 (0.1 = 10%)
  autoCloseOnBreach: boolean; // 한도 초과 시 자동 청산
  checkIntervalMs: number;    // 리스크 체크 주기 (ms)
  symbol: string;             // 모니터링 심볼
}
```

### Risk Status

```typescript
interface RiskStatus {
  dailyPnl: number;           // 오늘 손익
  dailyLossRemaining: number; // 남은 일일 한도
  peakBalance: number;        // 최고 잔고
  currentBalance: number;     // 현재 잔고
  currentDrawdown: number;    // 현재 드로다운
  isDailyLimitBreached: boolean;
  isDrawdownBreached: boolean;
  isTradingAllowed: boolean;  // 거래 허용 여부
  lastCheck: number;          // 마지막 체크 시간
}
```

### Event System

```typescript
type RiskManagerEvents = {
  riskBreach: [breach: RiskBreach];      // 한도 초과 발생
  statusChanged: [status: RiskStatus];   // 상태 변경
  tradingBlocked: [reason: string];      // 거래 차단
  tradingResumed: [];                    // 거래 재개
  error: [error: Error];                 // 에러 발생
};
```

### Trading Control Flow

```
Execution Engine → isTradingAllowed() → Risk Manager
                                              ↓
                                      Check Daily Limit
                                              ↓
                                      Check Drawdown
                                              ↓
                                      Return: true/false
```

### Auto-close Mechanism

한도 초과 시 자동 청산 절차:
1. 모든 미체결 주문 취소 (`cancelAllOrders`)
2. 현재 포지션 조회
3. 포지션 존재 시 반대 방향 Market Order로 청산
4. 거래 차단 상태 유지

### Day Rollover

- **UTC 00:00 기준** 새로운 일 시작
- 자동으로 일일 통계 리셋
- Daily Limit으로 차단된 경우 거래 재개

---

## Alternatives Considered

### Execution Engine 통합
- 장점: 코드 중복 감소
- 단점: SRP 위반, 테스트 복잡도 증가
- 결정: 별도 모듈로 분리

### Per-trade Risk Limit
- 장점: 개별 거래 리스크 제한
- 단점: 구현 복잡도 증가
- 결정: Daily/Drawdown 방식 우선 채택

### External Risk Management Service
- 장점: 고급 리스크 분석
- 단점: 추가 의존성, 비용
- 결정: 자체 구현

---

## Consequences

### Positive
- 과도한 손실 방지
- 일관된 리스크 관리
- 자동화된 보호 메커니즘
- 실시간 리스크 모니터링

### Trade-offs
- 한도 초과 시 수익 기회 상실 가능
- 자동 청산 시 불리한 가격에 청산될 수 있음
- 폴링 기반으로 약간의 체크 지연

### Safety Considerations

| 상황 | 대응 |
|------|------|
| 일일 손실 한도 초과 | 거래 차단, 다음 날 자동 해제 |
| 드로다운 초과 | 거래 차단, 수동 해제 필요 |
| API 오류 | 보수적 접근 (기존 상태 유지) |
| 네트워크 장애 | 에러 이벤트 발행, 로깅 |

### Integration Points

```
┌─────────────────┐     ┌──────────────────┐
│ Strategy Engine │────▶│ Execution Engine │
└─────────────────┘     └────────┬─────────┘
                                 │
                                 ▼
                        ┌────────────────┐
                        │  Risk Manager  │
                        │                │
                        │ • Daily Limit  │
                        │ • Max Drawdown │
                        │ • Auto-close   │
                        └────────────────┘
                                 │
                                 ▼
                        ┌────────────────┐
                        │   Dashboard    │
                        │ (Risk Status)  │
                        └────────────────┘
```

---

## Recommended Default Values

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| dailyLossLimitUsdt | 100 | 초기 설정, 계좌 규모에 따라 조정 |
| maxDrawdownPercent | 0.1 (10%) | 일반적인 트레이딩 기준 |
| autoCloseOnBreach | false | 초기에는 수동 관리 권장 |
| checkIntervalMs | 10000 (10초) | 리소스 절약과 적시성 균형 |

---

## Related

- [[ADR-006-Execution-Engine]]
- [[ADR-007-Position-Manager]]
- [[ADR-005-Security & API Key Management Policy]]
