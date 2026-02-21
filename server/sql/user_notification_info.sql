create table if not exists public.user_notification_info (
  id bigserial primary key,
  user_id uuid not null,
  endpoint text not null,
  p256dh_key text not null,
  auth_key text not null,
  subscription_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_notification_info_user_endpoint_uq
  on public.user_notification_info(user_id, endpoint);

create index if not exists user_notification_info_user_id_idx
  on public.user_notification_info(user_id);
