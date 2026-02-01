export interface Game {
  id: string;
  date: string;
  time: string;
  sport: string;
  level: string;
  homeTeam: string;
  awayTeam: string;
  venue: string;
  position: string;
  status: string;
  crew: CrewMember[];
  notes?: string;
}

export interface CrewMember {
  name: string;
  position: string;
  phone?: string;
  email?: string;
}

export interface AvailabilityDay {
  date: string;
  available: boolean;
  note?: string;
}

export interface Contact {
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  organization?: string;
}

export interface Profile {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  sports?: string[];
  organizations?: string[];
}

export interface CalendarFeed {
  url: string;
  description: string;
}

export interface LoginResult {
  success: boolean;
  message: string;
  name?: string;
}

export interface ScheduleResult {
  games: Game[];
  period?: string;
}
