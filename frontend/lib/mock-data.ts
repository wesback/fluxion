import { Stats, Host, PackageUpdate, HostUpdate, PackageHost } from './api';

export const mockStats: Stats = {
  total_hosts: 12,
  total_updates: 1543,
  updates_last_24h: 45,
  updates_last_7d: 267,
  most_updated_packages: [
    { package: 'linux-image-generic', count: 156 },
    { package: 'systemd', count: 89 },
    { package: 'nginx', count: 67 },
    { package: 'postgresql', count: 54 },
    { package: 'docker-ce', count: 43 },
  ],
  most_active_hosts: [
    { hostname: 'web-server-01', count: 234 },
    { hostname: 'db-server-01', count: 189 },
    { hostname: 'api-server-02', count: 156 },
    { hostname: 'web-server-03', count: 134 },
    { hostname: 'cache-server-01', count: 98 },
  ],
};

export const mockHosts: Host[] = [
  {
    hostname: 'web-server-01',
    os_info: 'Ubuntu 22.04 LTS',
    last_seen: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    total_updates: 234,
  },
  {
    hostname: 'db-server-01',
    os_info: 'Ubuntu 22.04 LTS',
    last_seen: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    total_updates: 189,
  },
  {
    hostname: 'api-server-02',
    os_info: 'Debian 12',
    last_seen: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    total_updates: 156,
  },
  {
    hostname: 'web-server-03',
    os_info: 'Ubuntu 22.04 LTS',
    last_seen: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    total_updates: 134,
  },
  {
    hostname: 'cache-server-01',
    os_info: 'Ubuntu 20.04 LTS',
    last_seen: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    total_updates: 98,
  },
];

export const mockRecentUpdates: HostUpdate[] = [
  {
    hostname: 'web-server-01',
    package_name: 'nginx',
    old_version: '1.18.0-6ubuntu14.4',
    new_version: '1.18.0-6ubuntu14.5',
    timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    update_timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    is_security: true,
  },
  {
    hostname: 'db-server-01',
    package_name: 'postgresql-14',
    old_version: '14.9-0ubuntu0.22.04.1',
    new_version: '14.10-0ubuntu0.22.04.1',
    timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    update_timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    is_security: false,
  },
  {
    hostname: 'api-server-02',
    package_name: 'docker-ce',
    old_version: '24.0.7-1',
    new_version: '24.0.8-1',
    timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    update_timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    is_security: false,
  },
  {
    hostname: 'web-server-03',
    package_name: 'systemd',
    old_version: '249.11-0ubuntu3.11',
    new_version: '249.11-0ubuntu3.12',
    timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    update_timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    is_security: false,
  },
  {
    hostname: 'cache-server-01',
    package_name: 'redis-server',
    old_version: '6.0.16-1ubuntu1',
    new_version: '6.0.16-1ubuntu2',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    update_timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    is_security: false,
  },
];

export const mockHostUpdates: PackageUpdate[] = [
  {
    package_name: 'nginx',
    old_version: '1.18.0-6ubuntu14.4',
    new_version: '1.18.0-6ubuntu14.5',
    update_timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    is_security: true,
  },
  {
    package_name: 'systemd',
    old_version: '249.11-0ubuntu3.11',
    new_version: '249.11-0ubuntu3.12',
    update_timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    is_security: false,
  },
  {
    package_name: 'linux-image-generic',
    old_version: '5.15.0.91.91',
    new_version: '5.15.0.92.92',
    update_timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    is_security: false,
  },
];

export const mockPackageHosts: PackageHost[] = [
  {
    hostname: 'web-server-01',
    package_name: 'nginx',
    current_version: '1.18.0-6ubuntu14.5',
    last_updated: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  },
  {
    hostname: 'web-server-03',
    package_name: 'nginx',
    current_version: '1.18.0-6ubuntu14.5',
    last_updated: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
  {
    hostname: 'api-server-02',
    package_name: 'nginx',
    current_version: '1.18.0-6ubuntu14.4',
    last_updated: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
];
