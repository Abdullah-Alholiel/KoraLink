import {
  LayoutDashboard,
  MapPin,
  CalendarDays,
  Users,
  BarChart2,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export type UserRole = 'ADMIN' | 'VENUE_OWNER';

export interface NavItem {
  /** Key used to look up the label in the `nav` i18n namespace. */
  labelKey: string;
  href: string;
  icon: LucideIcon;
  /** Roles allowed to see this item. */
  roles: UserRole[];
}

/** Navigation items visible to Super Admins (HQ Mission Control). */
export const adminNavItems: NavItem[] = [
  {
    labelKey: 'dashboard',
    href: '/admin',
    icon: LayoutDashboard,
    roles: ['ADMIN'],
  },
  {
    labelKey: 'venues',
    href: '/admin/venues',
    icon: MapPin,
    roles: ['ADMIN'],
  },
  {
    labelKey: 'bookings',
    href: '/admin/bookings',
    icon: CalendarDays,
    roles: ['ADMIN'],
  },
  {
    labelKey: 'users',
    href: '/admin/users',
    icon: Users,
    roles: ['ADMIN'],
  },
  {
    labelKey: 'reports',
    href: '/admin/reports',
    icon: BarChart2,
    roles: ['ADMIN'],
  },
  {
    labelKey: 'settings',
    href: '/admin/settings',
    icon: Settings,
    roles: ['ADMIN'],
  },
];

/** Navigation items visible to Venue Owners (Partner Portal). */
export const partnerNavItems: NavItem[] = [
  {
    labelKey: 'dashboard',
    href: '/partner',
    icon: LayoutDashboard,
    roles: ['VENUE_OWNER'],
  },
  {
    labelKey: 'myVenue',
    href: '/partner/venue',
    icon: MapPin,
    roles: ['VENUE_OWNER'],
  },
  {
    labelKey: 'bookings',
    href: '/partner/bookings',
    icon: CalendarDays,
    roles: ['VENUE_OWNER'],
  },
  {
    labelKey: 'reports',
    href: '/partner/reports',
    icon: BarChart2,
    roles: ['VENUE_OWNER'],
  },
  {
    labelKey: 'settings',
    href: '/partner/settings',
    icon: Settings,
    roles: ['VENUE_OWNER'],
  },
];

/** Returns the nav items for the given role. */
export function getNavItems(role: UserRole): NavItem[] {
  return role === 'ADMIN' ? adminNavItems : partnerNavItems;
}
