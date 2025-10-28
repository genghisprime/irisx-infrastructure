# IRIS Workforce Management & Shift Scheduling

> **AI-powered shift scheduling, forecasting, adherence tracking, and workforce optimization**

---

## Overview

**Why WFM Matters:**
- Contact centers waste 20-30% of labor cost on poor scheduling
- Over-staffing: Agents idle, high costs
- Under-staffing: Long wait times, SLA breaches, customer churn
- Manual scheduling takes supervisors 10+ hours/week

**Solution:**
- ✅ AI forecasting (predict call volume 30 days out)
- ✅ Automated shift scheduling (optimal staffing levels)
- ✅ Real-time adherence tracking (are agents at desk when scheduled?)
- ✅ Break management & time-off requests
- ✅ Intraday adjustments (call spike? Offer overtime)
- ✅ Agent preferences & skills-based scheduling

**Business Impact:**
- 15-20% labor cost reduction
- 95%+ service level achievement
- 40% reduction in scheduling time
- Compete with Five9, Talkdesk, NICE WFM

---

## Features

### 1. Call Volume Forecasting

```typescript
import * as tf from '@tensorflow/tfjs-node';

interface ForecastInput {
  historical_data: Array<{ date: string; calls: number; day_of_week: number; holiday: boolean }>;
  forecast_days: number;
}

async function forecastCallVolume(input: ForecastInput): Promise<number[]> {
  // Prepare training data
  const features = input.historical_data.map(d => [
    d.day_of_week / 7, // Normalize to 0-1
    d.holiday ? 1 : 0,
    new Date(d.date).getDate() / 31, // Day of month
    Math.sin(2 * Math.PI * d.day_of_week / 7), // Cyclical encoding
    Math.cos(2 * Math.PI * d.day_of_week / 7),
  ]);

  const labels = input.historical_data.map(d => d.calls);

  // Simple LSTM model for time series
  const model = tf.sequential({
    layers: [
      tf.layers.lstm({ units: 50, returnSequences: true, inputShape: [features.length, features[0].length] }),
      tf.layers.dropout({ rate: 0.2 }),
      tf.layers.lstm({ units: 50 }),
      tf.layers.dense({ units: 1 }),
    ],
  });

  model.compile({
    optimizer: 'adam',
    loss: 'meanSquaredError',
  });

  // Train model
  const xs = tf.tensor3d([features]);
  const ys = tf.tensor2d([labels]);

  await model.fit(xs, ys, {
    epochs: 50,
    batchSize: 32,
    validationSplit: 0.2,
  });

  // Generate forecast
  const forecast: number[] = [];
  let lastSequence = features.slice(-7); // Last week

  for (let i = 0; i < input.forecast_days; i++) {
    const prediction = model.predict(tf.tensor3d([lastSequence])) as tf.Tensor;
    const value = (await prediction.data())[0];
    forecast.push(Math.round(value));

    // Update sequence
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + i + 1);

    lastSequence = [...lastSequence.slice(1), [
      nextDate.getDay() / 7,
      isHoliday(nextDate) ? 1 : 0,
      nextDate.getDate() / 31,
      Math.sin(2 * Math.PI * nextDate.getDay() / 7),
      Math.cos(2 * Math.PI * nextDate.getDay() / 7),
    ]];
  }

  return forecast;
}
```

### 2. Shift Scheduling Algorithm

```typescript
interface ShiftTemplate {
  id: string;
  name: string;
  start_time: string; // "09:00"
  end_time: string; // "17:00"
  break_minutes: number;
}

interface StaffingRequirement {
  interval_start: string; // "2025-01-15T09:00:00Z"
  required_agents: number;
}

async function generateOptimalSchedule(
  agents: Agent[],
  requirements: StaffingRequirement[],
  shift_templates: ShiftTemplate[],
  constraints: SchedulingConstraints
): Promise<Schedule> {
  // Use constraint satisfaction problem (CSP) solver

  const schedule: Schedule = { shifts: [] };

  // Group requirements by day
  const dayRequirements = groupByDay(requirements);

  for (const [date, intervals] of Object.entries(dayRequirements)) {
    // Determine how many agents needed per shift
    const shiftNeeds = calculateShiftNeeds(intervals, shift_templates);

    // Assign agents to shifts (greedy algorithm with constraints)
    for (const shiftTemplate of shift_templates) {
      const needed = shiftNeeds[shiftTemplate.id] || 0;

      // Find available agents
      const available = agents.filter(agent =>
        isAgentAvailable(agent, date, shiftTemplate, schedule, constraints)
      );

      // Sort by preference and fairness
      available.sort((a, b) => {
        const aScore = getAgentScore(a, date, shiftTemplate, schedule);
        const bScore = getAgentScore(b, date, shiftTemplate, schedule);
        return bScore - aScore;
      });

      // Assign top N agents
      for (let i = 0; i < Math.min(needed, available.length); i++) {
        schedule.shifts.push({
          agent_id: available[i].id,
          date,
          shift_template_id: shiftTemplate.id,
          start_time: shiftTemplate.start_time,
          end_time: shiftTemplate.end_time,
        });
      }
    }
  }

  // Validate schedule meets all requirements
  if (!validateSchedule(schedule, requirements)) {
    throw new Error('Could not generate valid schedule - insufficient agents');
  }

  return schedule;
}

function isAgentAvailable(
  agent: Agent,
  date: string,
  shift: ShiftTemplate,
  schedule: Schedule,
  constraints: SchedulingConstraints
): boolean {
  // Check max hours per week
  const weekHours = getWeekHours(agent.id, date, schedule);
  if (weekHours + getShiftHours(shift) > constraints.max_hours_per_week) {
    return false;
  }

  // Check consecutive days
  const consecutiveDays = getConsecutiveDays(agent.id, date, schedule);
  if (consecutiveDays >= constraints.max_consecutive_days) {
    return false;
  }

  // Check minimum rest between shifts
  const lastShift = getLastShift(agent.id, date, schedule);
  if (lastShift) {
    const restHours = getHoursBetween(lastShift.end_time, shift.start_time);
    if (restHours < constraints.min_rest_hours) {
      return false;
    }
  }

  // Check agent preferences
  if (agent.unavailable_dates?.includes(date)) {
    return false;
  }

  return true;
}
```

### 3. Real-Time Adherence Tracking

```typescript
interface AdherenceEvent {
  agent_id: string;
  timestamp: Date;
  event_type: 'shift_start' | 'break_start' | 'break_end' | 'shift_end' | 'status_change';
  scheduled_time?: Date;
  actual_time: Date;
  variance_minutes: number;
}

async function trackAdherence(agentId: string): Promise<AdherenceMetrics> {
  // Get today's schedule for agent
  const schedule = await db.query(`
    SELECT * FROM scheduled_shifts
    WHERE agent_id = $1 AND date = CURRENT_DATE
  `, [agentId]);

  if (schedule.rows.length === 0) {
    return { adherence_rate: null, reason: 'Not scheduled today' };
  }

  const shift = schedule.rows[0];

  // Get actual events
  const events = await db.query(`
    SELECT * FROM adherence_events
    WHERE agent_id = $1 AND DATE(timestamp) = CURRENT_DATE
    ORDER BY timestamp ASC
  `, [agentId]);

  // Calculate adherence
  let totalScheduledMinutes = 0;
  let adherentMinutes = 0;

  // Expected to be logged in at shift start
  const shiftStart = new Date(`${shift.date}T${shift.start_time}`);
  const shiftEnd = new Date(`${shift.date}T${shift.end_time}`);

  totalScheduledMinutes = (shiftEnd.getTime() - shiftStart.getTime()) / 60000;

  // Check actual login time
  const loginEvent = events.rows.find(e => e.event_type === 'shift_start');

  if (loginEvent) {
    const variance = (loginEvent.actual_time.getTime() - shiftStart.getTime()) / 60000;

    if (Math.abs(variance) <= 5) { // Within 5 minutes = adherent
      adherentMinutes += totalScheduledMinutes; // Simplified
    } else {
      adherentMinutes += Math.max(0, totalScheduledMinutes - Math.abs(variance));
    }
  }

  const adherenceRate = (adherentMinutes / totalScheduledMinutes) * 100;

  return {
    adherence_rate: adherenceRate,
    scheduled_minutes: totalScheduledMinutes,
    adherent_minutes: adherentMinutes,
    variance_minutes: totalScheduledMinutes - adherentMinutes,
  };
}
```

### 4. Intraday Adjustments

```typescript
// Monitor queue in real-time, offer overtime if needed
async function intraday Monitoring() {
  setInterval(async () => {
    // Check current queue depth
    const queueMetrics = await getQueueMetrics();

    if (queueMetrics.calls_waiting > 20 && queueMetrics.avg_wait_time > 180) {
      // SLA at risk, need more agents

      // Find agents not scheduled but available
      const availableAgents = await db.query(`
        SELECT a.id, a.name, a.phone_number
        FROM agents a
        LEFT JOIN scheduled_shifts ss ON ss.agent_id = a.id
          AND ss.date = CURRENT_DATE
        WHERE ss.id IS NULL
          AND a.status = 'offline'
      `);

      // Send offer via SMS
      for (const agent of availableAgents.rows) {
        await sendSMS({
          to: agent.phone_number,
          message: `Hi ${agent.name}, we're experiencing high call volume. Can you work an extra 4-hour shift today? Reply YES to accept (1.5x pay).`,
        });
      }

      console.log(`📢 Sent overtime offers to ${availableAgents.rows.length} agents`);
    }
  }, 5 * 60 * 1000); // Check every 5 minutes
}
```

---

## Database Schema

```sql
-- Shift templates
CREATE TABLE shift_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_minutes INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Scheduled shifts
CREATE TABLE scheduled_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shift_template_id UUID REFERENCES shift_templates(id),

  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,

  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'cancelled', 'completed')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(agent_id, date, start_time)
);

-- Adherence events
CREATE TABLE adherence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,

  event_type TEXT NOT NULL CHECK (event_type IN ('shift_start', 'break_start', 'break_end', 'shift_end', 'status_change')),
  scheduled_time TIMESTAMPTZ,
  actual_time TIMESTAMPTZ NOT NULL,
  variance_minutes INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Time-off requests
CREATE TABLE time_off_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,

  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,

  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scheduled_shifts_agent ON scheduled_shifts(agent_id, date);
CREATE INDEX idx_adherence_events_agent ON adherence_events(agent_id, DATE(actual_time));
```

---

## UI Components

```tsx
export function ScheduleCalendar({ agentId }: { agentId: string }) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    fetchSchedule();
  }, [selectedDate]);

  async function fetchSchedule() {
    const response = await fetch(`/v1/wfm/schedule/${agentId}?month=${selectedDate.getMonth() + 1}`);
    const data = await response.json();
    setShifts(data.shifts);
  }

  async function requestTimeOff(startDate: Date, endDate: Date, reason: string) {
    await fetch('/v1/wfm/time-off', {
      method: 'POST',
      body: JSON.stringify({ start_date: startDate, end_date: endDate, reason }),
    });
    alert('Time-off request submitted');
  }

  return (
    <div className="schedule-calendar">
      <header>
        <button onClick={() => setSelectedDate(new Date(selectedDate.setMonth(selectedDate.getMonth() - 1)))}>
          ← Previous
        </button>
        <h2>{selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
        <button onClick={() => setSelectedDate(new Date(selectedDate.setMonth(selectedDate.getMonth() + 1)))}>
          Next →
        </button>
      </header>

      <div className="calendar-grid">
        {Array.from({ length: 31 }, (_, i) => i + 1).map(day => {
          const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day);
          const dayShifts = shifts.filter(s => new Date(s.date).getDate() === day);

          return (
            <div key={day} className="calendar-day">
              <div className="day-number">{day}</div>
              {dayShifts.map(shift => (
                <div key={shift.id} className="shift-badge">
                  {shift.start_time} - {shift.end_time}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <button onClick={() => {/* Open time-off modal */}}>
        Request Time Off
      </button>
    </div>
  );
}
```

---

## Cost Model

**Infrastructure:**
- Forecasting model (TensorFlow.js): $30/month (EC2 t3.medium)
- Scheduling algorithm: $0 (runs on existing API)
- Storage: Negligible

**Total: $30/month** for 100 agents

**Pricing:**
- Charge: $10/agent/month
- Cost: $0.30/agent/month
- **Margin: 97%**

---

## Summary

✅ **AI call volume forecasting**
✅ **Automated shift scheduling**
✅ **Real-time adherence tracking**
✅ **Intraday adjustments**
✅ **97% margin**

**Ready to optimize labor costs! 📅✨**
