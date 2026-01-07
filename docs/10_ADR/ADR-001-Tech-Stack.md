---
type: adr
project: Binance-Bollinger-Notice-Bot
id: ADR-001
status: accepted
date: 2026-01-07
tags: [adr, tech-stack, architecture]
---

# ADR-001: Tech Stack & Core Architecture Selection

## Context

본 프로젝트는 **Binance Futures 시장의 실시간 시세 데이터**를 기반으로  
**볼린저 밴드(Bollinger Bands)** 전략을 계산하여  
**Long / Short 포지션 진입 신호를 사용자에게 즉시 알림**하는 Notice Bot을 구축하는 것을 목표로 한다.

프로젝트의 핵심 요구사항은 다음과 같다.

- 실시간(저지연) 데이터 처리
- 기술적 지표의 빠르고 안정적인 연산
- WebSocket 기반 스트리밍 처리
- 알림 지연이 없는 사용자 전달
- 향후 자동 매매(주문 실행)로 확장 가능성

해당 요구사항의 기술적 타당성과 아키텍처 방향성은  
사전 분석 문서에서 검증되었다 :contentReference[oaicite:0]{index=0}.

---

## Decision

다음과 같은 **기술 스택 및 아키텍처 방향**을 채택한다.

### Runtime / Language
- **Node.js**
  - 이벤트 기반 비동기 처리 모델을 통해 WebSocket I/O에 최적화
  - 단일 프로세스로 다수의 스트림 처리 가능

### Exchange API
- **Binance USDⓈ-M Futures API**
  - Long / Short 포지션 네이티브 지원
  - Hedge Mode 확장 가능성
  - REST + WebSocket 모두 제공

### Exchange SDK
- **@binance/futures-connector (공식 SDK)**
  - 바이낸스 선물 API 최신 스펙 반영
  - 의존성 최소, 경량 구조

### Market Data Ingestion
- **Binance WebSocket (Kline Stream)**
  - HTTP Polling 방식 배제
  - 캔들 확정(x=true) 기준 지표 계산

### Indicator Engine
- **technicalindicators 라이브러리**
  - Bollinger Bands 계산 검증 완료
  - Node.js 환경에서 ms 단위 연산 가능

### Notification Channel
- **Telegram Bot API**
  - 별도 앱 설치 불필요
  - 무료·즉시성·높은 도달률

### Process Management
- **PM2**
  - 장애 발생 시 자동 재시작
  - 장기 실행 프로세스 안정성 확보

---

## Architecture Overview

시스템은 다음 **4개 핵심 모듈**로 구성된다.

1. **Market Data Consumer**
   - Binance WebSocket 연결
   - 자동 재연결 및 Heartbeat 관리

2. **Strategy Engine**
   - 캔들 데이터 버퍼링
   - Bollinger Bands 실시간 계산
   - Long / Short 진입 조건 판별

3. **Notification Service**
   - 신호 발생 시 메시지 포맷팅
   - Telegram 알림 전송

4. **Supervisor / Task Manager**
   - 프로세스 상태 감시
   - 비정상 종료 시 재기동

이 구조는 **알림 봇 → 자동 주문 실행 시스템**으로의 확장을 고려한 설계이다 :contentReference[oaicite:1]{index=1}.

---

## Alternatives Considered

### Python 기반 Bot
- 장점
  - 금융 라이브러리 풍부
- 단점
  - 실시간 WebSocket 다중 처리 시 성능 병목 가능
  - 이벤트 기반 처리에 불리

### ccxt 통합 라이브러리
- 장점
  - 다중 거래소 지원
- 단점
  - 무거운 의존성
  - Binance 고유 WebSocket 기능 활용 제한

### Binance Spot API
- 단점
  - Short 포지션 운용 복잡
  - 본 프로젝트 요구사항 불충족

---

## Consequences

### Positive
- 실시간 처리에 최적화된 구조 확보
- Binance Futures 특화 기능 최대 활용
- 알림 지연 최소화
- 자동 매매 시스템으로의 확장 용이

### Trade-offs
- Binance 거래소 종속성 증가
- 다중 거래소 확장 시 추가 추상화 필요

---

## Related

- [[ADR-002-Trading Strategy – Bollinger Bands Mean Reversion with Volatility Filter]]
- [[20_System_Design/API_Strategy]]
- [[20_System_Design/System_Architecture]]
- [[00_Map_of_Content]]
