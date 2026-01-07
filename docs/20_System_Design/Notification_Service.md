---
type: system-design
project: Binance-Bollinger-Notice-Bot
date: 2026-01-07
tags: [system-design, notification, telegram]
---

# Notification Service

## Overview

Notification Service는 Strategy Engine으로부터 전달받은 **유효한 매매 신호**를  
사용자에게 **지연 없이, 중복 없이, 신뢰도 높게** 전달하는 **출구 레이어(Output Layer)** 이다.

본 모듈은 **알림 품질과 운영 안정성**을 최우선 목표로 설계되었다.

설계 근거 ADR:

- [[ADR-001-Tech-Stack]]
- [[ADR-004-Notification-Debounce-Policy]]
- [[ADR-005-Security-API-Key-Management]]

---

## Responsibilities

Notification Service의 책임은 다음과 같다.

1. Strategy Engine 신호 수신
2. 알림 중복 제어(Debounce)
3. Rate Limit 대응
4. 알림 메시지 포맷팅
5. Telegram API를 통한 메시지 전송
6. 치명적 오류 알림 분리 처리

> ❗ 전략 판단 및 지표 계산은 이 모듈의 책임이 아니다.

---

## Input Contract

### Incoming Event

Strategy Engine으로부터 다음 이벤트를 수신한다.

```ts
onSignalDetected({
  type: "LONG" | "SHORT",
  symbol: string,
  closePrice: number,
  bandValue: number,
  timestamp: number
})
````

---

## Debounce Policy

### Candle-based Debounce

- 동일 캔들(timestamp 기준)에서:
    
    - 동일 포지션 타입(LONG / SHORT) 알림은 1회만 허용
        

### State Tracking

다음 상태 정보를 메모리에 유지한다.

```ts
{
  lastNotifiedTimestamp: number,
  lastNotifiedType: "LONG" | "SHORT"
}
```

### Debounce Rule

- `timestamp === lastNotifiedTimestamp`
    
- `type === lastNotifiedType`
    

→ 위 조건이 모두 충족되면 알림 생략

(근거: [[ADR-004-Notification-Debounce-Policy]])

---

## Rate Limit Strategy

Telegram Bot API 제약 대응 정책:

- 초당 메시지 전송량 제한 고려
    
- 알림 폭주 방지를 위해:
    
    - 내부 전송 큐(Queue) 적용 가능
        
    - 연속 메시지 전송 간 최소 간격 유지
        

### Priority Handling

- 일반 신호 알림
    
- 시스템 오류 알림 (우선순위 높음)
    

오류 알림은:

- 신호 알림과 별도 포맷
    
- 빈도 제한 적용
    

---

## Message Formatting

### Signal Notification Template

```md
🚨 *{{TYPE}} 포지션 진입 신호*

• 코인: {{SYMBOL}}
• 현재가: {{PRICE}}
• 기준 밴드: {{BAND}}
• 시간: {{TIME}}
```

### Formatting Rules

- Markdown 사용
    
- 핵심 정보 우선 배치
    
- 모바일 가독성 최적화
    

---

## Delivery Channel

### Platform

- Telegram Bot API
    

### Configuration (Environment)

- `TELEGRAM_BOT_TOKEN`
    
- `TELEGRAM_CHAT_ID`
    

모든 민감 정보는 환경 변수로 관리하며,  
코드 내 하드코딩을 금지한다.

(근거: [[ADR-005-Security-API-Key-Management]])

---

## Error Notification Policy

### Fatal Error Types

- Telegram API 인증 실패
    
- 메시지 전송 지속 실패
    
- 환경 변수 누락
    

### Error Notification Template

```md
❗ *BOT ERROR DETECTED*

• 유형: {{ERROR_TYPE}}
• 메시지: {{ERROR_MESSAGE}}
• 시간: {{TIME}}
```

---

## Retry Policy

- 전송 실패 시:
    
    - 즉시 무한 재시도 ❌
        
    - 제한된 재시도 횟수 적용 ⭕
        
- 연속 실패 시:
    
    - 관리자 오류 알림 발송
        
    - 신호 알림 일시 중단 가능
        

---

## State Management

Notification Service는 **휘발성 상태(In-Memory)** 만 유지한다.

- 마지막 알림 timestamp
    
- 마지막 알림 타입
    

### Restart Behavior

- 프로세스 재시작 시 상태 초기화
    
- 중복 알림 방지는 현재 실행 세션 기준으로만 보장
    

---

## Non-Goals

Notification Service는 다음을 수행하지 않는다.

- 지표 계산
    
- 매매 전략 판단
    
- 주문 실행
    
- 데이터 영속화(DB)
    

---

## Related

- [[ADR-004-Notification Debounce & Rate Limit Policy]]
    
- [[ADR-005-Security & API Key Management Policy]]
    
- [[20_System_Design/Strategy_Engine]]
    
- [[00_Map_of_Content]]