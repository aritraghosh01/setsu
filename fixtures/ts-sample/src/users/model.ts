export interface Money {
  cents: number;
  currency: string;
}

export enum CustomerStatus {
  Active = 'active',
  Suspended = 'suspended',
  Closed = 'closed',
}

export interface User {
  id: string;
  email: string;
  status: CustomerStatus;
}

export type UserId = User['id'];
