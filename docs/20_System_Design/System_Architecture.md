---
type: system-design
project: Binance-Bollinger-Notice-Bot
date: 2026-01-07
tags: [system-design, architecture, overview]
---

# System Architecture

## Overview

본 문서는 **Binance Bollinger Notice Bot**의 전체 시스템 구조를 정의한다.  
시스템은 **실시간 이벤트 기반(Event-driven) 파이프라인**으로 구성되며,  
각 모듈은 **단일 책임 원칙(SRP)** 에 따라 명확히 분리된다.

아키텍처 설계의 주요 목표는 다음과 같다.

- 실시간 데이터 처리 신뢰성
- 전략 판단의 명확한 책임 분리
- 알림 품질 및 운영 안정성
- 자동 매매로의 확장 가능성

---

## High-Level Architecture

```text
┌────────────────────────────┐
│ Binance Futures WebSocket  │
└──────────────┬─────────────┘
               │ (Kline Stream)
               ▼
┌────────────────────────────┐
│ Market Data Consumer       │
│ - WebSocket Connection     │
│ - Candle Confirmation      │
│ - Data Buffering           │
└──────────────┬─────────────┘
               │ (onCandleClosed)
               ▼
┌────────────────────────────┐
│ Strategy Engine             │
│ - Bollinger Bands           │
│ - Mean Reversion Logic      │
│ - Volatility Filter         │
└──────────────┬─────────────┘
               │ (onSignalDetected)
               ▼
┌────────────────────────────┐
│ Notification Service        │
│ - Debounce Control          │
│ - Rate Limit Handling       │
│ - Message Formatting        │
└──────────────┬─────────────┘
               │
               ▼
┌────────────────────────────┐
│ Telegram Bot API            │
└────────────────────────────┘
````

---

## Architectural Style

### Event-Driven Architecture

- 모든 모듈은 **이벤트 기반으로 연결**
    
- 동기 호출 최소화
    
- 느슨한 결합(Loose Coupling) 유지
    

```text
Data Event → Strategy Event → Notification Event
```

---

## Component Responsibilities

### 1. Market Data Consumer

**역할**

- Binance WebSocket 연결 관리
    
- 실시간 캔들 데이터 수신
    
- 캔들 확정(x = true) 필터링
    

**설계 근거**

- [[ADR-003-WebSocket Data Handling & Candle Confirmation Policy]]
    

**관련 문서**

- [[20_System_Design/Market_Data_Consumer]]
    

---

### 2. Strategy Engine

**역할**

- Bollinger Bands 계산
    
- Mean Reversion 진입 판단
    
- Volatility Filter 적용
    

**설계 근거**

- [[ADR-002-Trading Strategy – Bollinger Bands Mean Reversion with Volatility Filter]]
    

**관련 문서**

- [[20_System_Design/Strategy_Engine]]
    

---

### 3. Notification Service

**역할**

- 신호 디바운스 처리
    
- Telegram Rate Limit 대응
    
- 사용자 알림 전송
    

**설계 근거**

- [[ADR-004-Notification Debounce & Rate Limit Policy]]
    

**관련 문서**

- [[20_System_Design/Notification_Service]]
    

---

## Cross-Cutting Concerns

### Security

- API Key 환경 변수 관리
    
- IP Whitelist 적용
    
- 최소 권한 원칙
    

(근거: [[ADR-005-Security & API Key Management Policy]])

---

### Resilience & Stability

- WebSocket 재연결
    
- Watchdog / Heartbeat
    
- Process Auto-Restart (PM2)
    

---

### Observability

- 구조화 로그
    
- 오류 알림 분리
    
- 장애 추적 가능성 확보
    

---

## Data Flow Summary

1. Binance WebSocket에서 Kline 데이터 수신
    
2. 캔들 확정 시 Market Data Consumer 이벤트 발생
    
3. Strategy Engine에서 지표 계산 및 신호 판단
    
4. Notification Service에서 알림 제어 및 전송
    
5. Telegram을 통해 사용자에게 전달
    

---

## Non-Goals

본 아키텍처는 다음을 목표로 하지 않는다.

- 고빈도 자동 매매(HFT)
    
- Tick 단위 주문 실행
    
- 서버리스(Serverless) 구조
    
- 데이터베이스 기반 상태 저장
    

---

## Extension Points

본 시스템은 다음 확장을 고려하여 설계되었다.

- 주문 실행 모듈 (Execution Engine)
    
- 다중 전략 병렬 운용
    
- 포트폴리오 관리
    
- 머신러닝 기반 신호 필터링
    

---

## Related

- [[ADR-001-Tech-Stack]]
    
- [[ADR-002-Trading Strategy – Bollinger Bands Mean Reversion with Volatility Filter]]
    
- [[ADR-003-WebSocket Data Handling & Candle Confirmation Policy]]
    
- [[ADR-004-Notification Debounce & Rate Limit Policy]]
    
- [[ADR-005-Security & API Key Management Policy]]
    
- [[00_Map_of_Content]]