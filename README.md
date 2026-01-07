# Binance Bollinger Notice Bot

Binance Bollinger Notice Bot은 **Binance Futures 실시간 시세 데이터**를 기반으로  
**볼린저 밴드(Bollinger Bands) 전략에 따른 Long / Short 진입 신호를  
Telegram으로 즉시 전달**하는 이벤트 기반 알림 봇입니다.

> 이 프로젝트는 **자동 매매가 아닌 알림(Notice) 시스템**이며,  
> 향후 주문 실행 시스템으로 확장 가능하도록 설계되었습니다.

---

## 🎯 Goals

- 실시간 시장 데이터 기반 신뢰도 높은 진입 알림
- 전략 판단과 알림 전송의 명확한 책임 분리
- 장기 무중단 운영이 가능한 구조
- ADR 기반 설계 의사결정 기록 유지

---

## 🏗 System Architecture (High-Level)

```text
Binance Futures WebSocket
        │
        ▼
Market Data Consumer
        │ (onCandleClosed)
        ▼
Strategy Engine
        │ (onSignalDetected)
        ▼
Notification Service
        │
        ▼
Telegram Bot API
````

* **Event-driven architecture**
* 각 모듈은 단일 책임 원칙(SRP)에 따라 분리됨

상세 구조는 다음 문서를 참고하세요.

* `20_System_Design/System_Architecture.md`

---

## 🧠 Core Components

### Market Data Consumer

* Binance Futures WebSocket 연결
* 캔들 확정(`x = true`) 기준 데이터 전달
* 연결 복구 및 안정성 관리

### Strategy Engine

* Bollinger Bands (20, 2) 계산
* Mean Reversion 기반 진입 판단
* Volatility Filter 적용

### Notification Service

* 중복 알림 방지(Debounce)
* Telegram Rate Limit 대응
* 메시지 포맷팅 및 전송

---

## 📚 Design Documents

### ADR (Architecture Decision Records)

* `ADR-001` Tech Stack & Architecture
* `ADR-002` Trading Strategy (Bollinger Bands)
* `ADR-003` WebSocket Data Handling Policy
* `ADR-004` Notification Debounce & Rate Limit
* `ADR-005` Security & API Key Management

### System Design

* `Market_Data_Consumer.md`
* `Strategy_Engine.md`
* `Notification_Service.md`
* `System_Architecture.md`

---

## 🔐 Security & Operations

* 모든 민감 정보는 `.env` 파일로 관리
* Binance API Key IP Whitelist 적용
* 최소 권한 원칙 (초기: Read-only)
* PM2 기반 프로세스 관리

---

## 🚀 Future Extensions

* 자동 주문 실행(Execution Engine)
* 다중 전략 병렬 운용
* 포트폴리오 관리
* 머신러닝 기반 신호 필터링

---

## ⚠ Disclaimer

이 프로젝트는 **투자 조언을 제공하지 않으며**,
모든 투자 판단의 책임은 사용자 본인에게 있습니다.