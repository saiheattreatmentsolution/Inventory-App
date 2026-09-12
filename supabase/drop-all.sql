-- =============================================================
-- Sai Group Inventory — wipe everything this app created
--
-- Run this once, then schema.sql, then data.sql, in that order. Only for
-- starting over on a project whose data is not worth keeping — every table
-- drops with CASCADE, taking every row, index, trigger and policy on it
-- with it. This does not touch auth.users (your logins survive), only the
-- trigger this app added on it.
-- =============================================================

drop trigger if exists on_auth_user_created on auth.users;

-- Tables (CASCADE also removes their indexes, triggers and policies)
drop table if exists public.job_stock  cascade;
drop table if exists public.units      cascade;
drop table if exists public.movements  cascade;
drop table if exists public.items      cascade;
drop table if exists public.jobs       cascade;
drop table if exists public.categories cascade;
drop table if exists public.profiles   cascade;

-- Functions — every argument shape this app has ever used, old and new,
-- so this works no matter which version of schema.sql or migrate.sql you
-- last ran. Dropping a signature that was never created is a silent no-op.
drop function if exists public.purge_movements(timestamptz);
drop function if exists public.database_size_bytes();
drop function if exists public.unit_costs();
drop function if exists public.item_costs();
drop function if exists public.set_user_role(uuid, text);
drop function if exists public.delete_job(uuid);
drop function if exists public.apply_movement(text, text, numeric, text, text, uuid, text[], numeric, text, int);
drop function if exists public.apply_movement(text, text, numeric, text, text, uuid, text[], numeric, text);
drop function if exists public.create_item(text, text, text, numeric, numeric, numeric, text);
drop function if exists public.create_category(text, text);
drop function if exists public.mint_units(text, int, numeric, text, int);
drop function if exists public.mint_units(text, int, numeric, text);
drop function if exists public.items_keep_tracking_honest();
drop function if exists public.current_actor();
drop function if exists public.next_item_id(text);
drop function if exists public.assert_can_write();
drop function if exists public.is_admin();
drop function if exists public.handle_new_user();
