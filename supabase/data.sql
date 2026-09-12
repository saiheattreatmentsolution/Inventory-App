-- =============================================================
-- Sai Group Inventory — starting catalogue from Sai Heat Sock Management.xlsx
-- Run ONCE, after schema.sql. Running it twice creates every product twice.
--
-- This loads the CATALOGUE only — categories, the 56 product names and units,
-- and the 7 job names from STOCK OUT. It deliberately does NOT load the
-- workbook's balances, thresholds or costs: enter those yourself from the app
-- (Add item's opening quantity, or Update stock afterwards), so day-one stock
-- is a real, deliberately-checked count rather than a copy of old paperwork.
-- Every product starts at 0 with no reorder threshold and no cost.
-- =============================================================

-- ---------- categories, grouped from the product names in STOCK SUMMURY ----------
-- More can be added later from the app (Add item, or Manage people).
insert into public.categories (name, code)
values
  ('Burners', 'BRN'),
  ('Blowers', 'BLW'),
  ('Control panels', 'CPL'),
  ('Pumps', 'PMP'),
  ('Hoses', 'HOS'),
  ('Air distribution', 'AIR'),
  ('Thermocouples & sensors', 'TCS'),
  ('Recorders & instruments', 'INS'),
  ('PWHT panels', 'PWH'),
  ('Cables', 'CBL'),
  ('Heating elements', 'HTE'),
  ('Storage & misc', 'MSC');

-- ---------- jobs named in STOCK OUT ----------
insert into public.jobs (name, customer)
values
  ('Gemini', 'Gemini'),
  ('JSPL', 'JSPL'),
  ('OPTECH somalia', 'OPTECH somalia'),
  ('Tema', 'Tema'),
  ('Tema shifted from gemini', 'Tema shifted from gemini'),
  ('INSteel', 'INSteel'),
  ('MMP Refra tech', 'MMP Refra tech');

-- ---------- products ----------

-- Oil Burner 30 MBTU  (Burners)
select public.create_item('Oil Burner 30 MBTU', 'Burners', 'pcs', 0, 0, null, null);

-- Oil Burner 12 MBTU  (Burners)
select public.create_item('Oil Burner 12 MBTU', 'Burners', 'pcs', 0, 0, null, null);

-- Oil Burner 8 MBTU  (Burners)
select public.create_item('Oil Burner 8 MBTU', 'Burners', 'pcs', 0, 0, null, null);

-- Air Blower 25 HP  (Blowers)
select public.create_item('Air Blower 25 HP', 'Blowers', 'pcs', 0, 0, null, null);

-- Air Blower 15 HP  (Blowers)
select public.create_item('Air Blower 15 HP', 'Blowers', 'pcs', 0, 0, null, null);

-- Control Panel 30 MBTU  (Control panels)
select public.create_item('Control Panel 30 MBTU', 'Control panels', 'pcs', 0, 0, null, null);

-- Control Panel 12 MBTU  (Control panels)
select public.create_item('Control Panel 12 MBTU', 'Control panels', 'pcs', 0, 0, null, null);

-- Control Panel 8 MBTU  (Control panels)
select public.create_item('Control Panel 8 MBTU', 'Control panels', 'pcs', 0, 0, null, null);

-- Oil Pump Dual type 5 HP  (Pumps)
select public.create_item('Oil Pump Dual type 5 HP', 'Pumps', 'pcs', 0, 0, null, null);

-- Oil Pump 1 HP  (Pumps)
select public.create_item('Oil Pump 1 HP', 'Pumps', 'pcs', 0, 0, null, null);

-- Oil Pump 3 HP  (Pumps)
select public.create_item('Oil Pump 3 HP', 'Pumps', 'pcs', 0, 0, null, null);

-- Hose 2" x 10 Meter  (Hoses)
select public.create_item('Hose 2" x 10 Meter', 'Hoses', 'pcs', 0, 0, null, null);

-- Hose 1" x 6 Meter  (Hoses)
select public.create_item('Hose 1" x 6 Meter', 'Hoses', 'pcs', 0, 0, null, null);

-- Hose 1" x 3 Meter  (Hoses)
select public.create_item('Hose 1" x 3 Meter', 'Hoses', 'pcs', 0, 0, null, null);

-- Hose 1/2" x 10 Meter  (Hoses)
select public.create_item('Hose 1/2" x 10 Meter', 'Hoses', 'pcs', 0, 0, null, null);

-- Hose 1/2" x 15 Meter  (Hoses)
select public.create_item('Hose 1/2" x 15 Meter', 'Hoses', 'pcs', 0, 0, null, null);

-- Hose 1/2" x 20 Meter  (Hoses)
select public.create_item('Hose 1/2" x 20 Meter', 'Hoses', 'pcs', 0, 0, null, null);

-- Hose 1/2" x 5 Meter  (Hoses)
select public.create_item('Hose 1/2" x 5 Meter', 'Hoses', 'pcs', 0, 0, null, null);

-- Hose 1/2" x 6 Meter  (Hoses)
select public.create_item('Hose 1/2" x 6 Meter', 'Hoses', 'pcs', 0, 0, null, null);

-- Air Many fold  (Air distribution)
select public.create_item('Air Many fold', 'Air distribution', 'pcs', 0, 0, null, null);

-- Thermocouple attachment unit Auto  (Thermocouples & sensors)
select public.create_item('Thermocouple attachment unit Auto', 'Thermocouples & sensors', 'pcs', 0, 0, null, null);

-- Thermocouple attachment unit Manual  (Thermocouples & sensors)
select public.create_item('Thermocouple attachment unit Manual', 'Thermocouples & sensors', 'pcs', 0, 0, null, null);

-- Thermocouple attachment unit Direct  (Thermocouples & sensors)
select public.create_item('Thermocouple attachment unit Direct', 'Thermocouples & sensors', 'pcs', 0, 0, null, null);

-- Temperature Recorder 24 Points Digital  (Recorders & instruments)
select public.create_item('Temperature Recorder 24 Points Digital', 'Recorders & instruments', 'pcs', 0, 0, null, null);

-- Temperature Recorder 12 Points Digital  (Recorders & instruments)
select public.create_item('Temperature Recorder 12 Points Digital', 'Recorders & instruments', 'pcs', 0, 0, null, null);

-- Temperature Recorder 12 Points Analog  (Recorders & instruments)
select public.create_item('Temperature Recorder 12 Points Analog', 'Recorders & instruments', 'pcs', 0, 0, null, null);

-- Hardness Tester  (Recorders & instruments)
select public.create_item('Hardness Tester', 'Recorders & instruments', 'pcs', 0, 0, null, null);

-- PWHT Panel 3 Chanel DPID  (PWHT panels)
select public.create_item('PWHT Panel 3 Chanel DPID', 'PWHT panels', 'pcs', 0, 0, null, null);

-- PWHT Panel 3 Chanel NPID  (PWHT panels)
select public.create_item('PWHT Panel 3 Chanel NPID', 'PWHT panels', 'pcs', 0, 0, null, null);

-- PWHT Panel 3 Chanel 6 Way DPID  (PWHT panels)
select public.create_item('PWHT Panel 3 Chanel 6 Way DPID', 'PWHT panels', 'pcs', 0, 0, null, null);

-- Input Cable 35sq mm 4 core x 14 Meter  (Cables)
select public.create_item('Input Cable 35sq mm 4 core x 14 Meter', 'Cables', 'pcs', 0, 0, null, null);

-- Input Cable 25sq mm 4 core x 10 Meter  (Cables)
select public.create_item('Input Cable 25sq mm 4 core x 10 Meter', 'Cables', 'pcs', 0, 0, null, null);

-- Output Cable 16 sq mm x 25 Meter-R  (Cables)
select public.create_item('Output Cable 16 sq mm x 25 Meter-R', 'Cables', 'pcs', 0, 0, null, null);

-- Output Cable 16 sq mm x 25 Meter-y  (Cables)
select public.create_item('Output Cable 16 sq mm x 25 Meter-y', 'Cables', 'pcs', 0, 0, null, null);

-- Output Cable 16 sq mm x 25 Meter-B  (Cables)
select public.create_item('Output Cable 16 sq mm x 25 Meter-B', 'Cables', 'pcs', 0, 0, null, null);

-- Output Cable 16 sq mm x 25 Meter-Black  (Cables)
select public.create_item('Output Cable 16 sq mm x 25 Meter-Black', 'Cables', 'pcs', 0, 0, null, null);

-- Welding Cable 35 sq mm x 33 Meter  (Cables)
select public.create_item('Welding Cable 35 sq mm x 33 Meter', 'Cables', 'pcs', 0, 0, null, null);

-- Welding Cable 25 sq mm x 33 Meter  (Cables)
select public.create_item('Welding Cable 25 sq mm x 33 Meter', 'Cables', 'pcs', 0, 0, null, null);

-- Spliter 3 Way  (Air distribution)
select public.create_item('Spliter 3 Way', 'Air distribution', 'pcs', 0, 0, null, null);

-- Nichrom coil 8 swg  (Heating elements)
select public.create_item('Nichrom coil 8 swg', 'Heating elements', 'kg', 0, 0, null, null);

-- Nichrom coil 10 swg  (Heating elements)
select public.create_item('Nichrom coil 10 swg', 'Heating elements', 'kg', 0, 0, null, null);

-- Nichrom coil 12 swg  (Heating elements)
select public.create_item('Nichrom coil 12 swg', 'Heating elements', 'kg', 0, 0, null, null);

-- Nichrom coil 14 swg  (Heating elements)
select public.create_item('Nichrom coil 14 swg', 'Heating elements', 'kg', 0, 0, null, null);

-- Nichrom coil 16 swg  (Heating elements)
select public.create_item('Nichrom coil 16 swg', 'Heating elements', 'kg', 0, 0, null, null);

-- Input cable 25 sq mm 1 x4 x 15 meter  (Cables)
select public.create_item('Input cable 25 sq mm 1 x4 x 15 meter', 'Cables', 'pcs', 0, 0, null, null);

-- Compansating cable  (Thermocouples & sensors)
select public.create_item('Compansating cable', 'Thermocouples & sensors', 'm', 0, 0, null, null);

-- Burner 10 MBTU  (Burners)
select public.create_item('Burner 10 MBTU', 'Burners', 'pcs', 0, 0, null, null);

-- Control Panel 10 MBTU  (Control panels)
select public.create_item('Control Panel 10 MBTU', 'Control panels', 'pcs', 0, 0, null, null);

-- Oil Pump 2 HP  (Pumps)
select public.create_item('Oil Pump 2 HP', 'Pumps', 'pcs', 0, 0, null, null);

-- Oil Pump 1.5 HP  (Pumps)
select public.create_item('Oil Pump 1.5 HP', 'Pumps', 'pcs', 0, 0, null, null);

-- Oil Pump 2 HP Duplex  (Pumps)
select public.create_item('Oil Pump 2 HP Duplex', 'Pumps', 'pcs', 0, 0, null, null);

-- Temperature Recorder R R  (Recorders & instruments)
select public.create_item('Temperature Recorder R R', 'Recorders & instruments', 'pcs', 0, 0, null, null);

-- Storage trunk  (Storage & misc)
select public.create_item('Storage trunk', 'Storage & misc', 'pcs', 0, 0, null, null);

-- Output Cable 7/18 22.5 Meter-Red  (Cables)
select public.create_item('Output Cable 7/18 22.5 Meter-Red', 'Cables', 'pcs', 0, 0, null, null);

-- Output Cable 7/18 22.5 Meter-Blue  (Cables)
select public.create_item('Output Cable 7/18 22.5 Meter-Blue', 'Cables', 'pcs', 0, 0, null, null);

-- PWHT Panel 3 Chanel -NO PID  (PWHT panels)
select public.create_item('PWHT Panel 3 Chanel -NO PID', 'PWHT panels', 'pcs', 0, 0, null, null);
