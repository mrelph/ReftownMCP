export interface Game {
  id: string;
  date: string;
  time: string;
  day?: string;
  sport: string;
  league?: string;
  type?: string;
  level: string;
  homeTeam: string;
  awayTeam: string;
  venue: string;
  position: string;
  status: string;
  organization?: string;
  crewType?: string;
  distance?: string;
  assignmentStatus?: string;
  crew: CrewMember[];
  comments?: string;
}

export interface CrewMember {
  name: string;
  position: string;
  isCurrentUser?: boolean;
  phone?: string;
  email?: string;
}

export interface AvailabilityDay {
  date: string;
  available: boolean;
  note?: string;
  source?: string;
  timeRestriction?: string;
  hasGame?: boolean;
  gameLink?: string;
}

export interface Contact {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  role?: string;
  organization?: string;
  vCardUrl?: string;
}

export interface Profile {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  registrationStatus?: string;
  zones?: string[];
  organizations?: string[];
  sports?: string[];
  customFields?: Record<string, string>;
}

export interface CalendarFeedEntry {
  url: string;
  httpsUrl?: string;
  scope: "games+events" | "games" | "events";
}

export interface CalendarFeedResult {
  feeds: CalendarFeedEntry[];
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
