# Gate 3: Program Design — Match Lifecycle & Real-Time Sync

## 1. Socket Event Payloads
```typescript
interface MatchStatusChangedEvent {
  matchId: string;
  status: 'Open' | 'Full' | 'InProgress' | 'Completed' | 'Cancelled';
  updatedAt: string;
}

interface MatchRosterUpdatedEvent {
  matchId: string;
  filledSpots: number;
  totalSpots: number;
  players: Array<{
    id: string;
    userId: string;
    fullName: string;
    avatarUrl: string | null;
    team: 'Home' | 'Away';
    isHost: boolean;
    noShow: boolean;
  }>;
}

interface MatchPomUpdatedEvent {
  matchId: string;
  votes: Record<string, number>;
  winnerId?: string;
  isCompleted: boolean;
}
```

## 2. API Service Interface Updates
```typescript
// In MatchesService
async updateMatchStatus(matchId: string, hostId: string, status: MatchStatus): Promise<Match>;
async markNoShow(matchId: string, hostId: string, targetUserId: string, noShow: boolean): Promise<Match>;
```

## 3. Approval Gate
- Required: User approval / Autonomous signoff under directive.
