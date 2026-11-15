-- ============================================================================
-- 1. «Ver como» (superadmin): probar la app con otro rol sin cambiar de cuenta.
--    La app manda la cabecera x-medora-ver-como: "caja" (o "medico,enfermeria"…).
--    Si quien llama es superadmin, los helpers de RLS usan SOLO esos roles (la
--    intersección con su membresía) e ignoran sus permisos por módulo, y
--    es_superadmin() responde false. SOLO RESTA: nunca da un rol que la persona no
--    tenga en ese sistema (el superadmin no ve lo clínico/financiero sin membresía).
--    Sin la cabecera todo funciona exactamente igual que antes.
-- 2. Catálogo CIE-10 (OPS/OMS, el que usa Salud Pública en RD) para todos los
--    diagnósticos. Se siembra con los códigos frecuentes en atención primaria;
--    el superadmin carga el catálogo completo con importar_cie10().
-- ============================================================================

-- 1 ─ Ver como ───────────────────────────────────────────────────────────────────
-- Roles pedidos en la cabecera (null si no hay cabecera o no son roles válidos).
create or replace function privado.ver_como()
returns public.rol_sistema[]
language sql
stable
set search_path = ''
as $$
  select nullif(array(
    select r::public.rol_sistema
      from unnest(string_to_array(
             coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-medora-ver-como', ''), ',')) as t (r)
     where trim(r) in (select unnest(enum_range(null::public.rol_sistema))::text)
  ), '{}');
$$;

-- Roles con los que se evalúa a la persona: los suyos, o (superadmin con «ver como») la intersección.
create or replace function privado.roles_vista(p_roles public.rol_sistema[], p_superadmin boolean)
returns public.rol_sistema[]
language sql
stable
set search_path = ''
as $$
  select case
           when p_superadmin and privado.ver_como() is not null
             then array(select unnest(p_roles) intersect select unnest(privado.ver_como()))::public.rol_sistema[]
           else p_roles
         end;
$$;

create or replace function privado.mis_sistemas_con_rol(p_roles public.rol_sistema[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.sistema_id
  from public.membresias m
  join public.sistemas s on s.id = m.sistema_id
  join public.perfiles p on p.id = m.usuario_id
  where m.usuario_id = (select auth.uid()) and m.activo and s.activo and p.activo
    and privado.roles_vista(m.roles, p.es_superadmin) && p_roles
    and (p.es_superadmin or not privado.en_mantenimiento());
$$;

create or replace function privado.mis_sistemas_con_rol(p_roles public.rol_sistema[], p_modulo text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.sistema_id
  from public.membresias m
  join public.sistemas s on s.id = m.sistema_id
  join public.perfiles p on p.id = m.usuario_id
  where m.usuario_id = (select auth.uid()) and m.activo and s.activo and p.activo
    and (p.es_superadmin or not privado.en_mantenimiento())
    and case
          -- Viendo como otro rol: solo cuenta el rol (no los permisos personales).
          when p.es_superadmin and privado.ver_como() is not null then privado.roles_vista(m.roles, true) && p_roles
          else case m.permisos ->> p_modulo
                 when 'true' then true
                 when 'false' then false
                 else m.roles && p_roles
               end
        end;
$$;

create or replace function privado.sistemas_vista_completa()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.sistema_id
  from public.membresias m
  join public.sistemas s on s.id = m.sistema_id
  join public.perfiles p on p.id = m.usuario_id
  where m.usuario_id = (select auth.uid()) and m.activo and s.activo and p.activo
    and (p.es_superadmin or not privado.en_mantenimiento())
    and not (privado.roles_vista(m.roles, p.es_superadmin) <@ '{medico,psicologia,nutricion,terapia,quiosco}'::public.rol_sistema[]);
$$;

create or replace function privado.es_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when coalesce((select p.es_superadmin and p.activo from public.perfiles p where p.id = (select auth.uid())), false)
             then privado.mfa_ok() and privado.ver_como() is null
           else false
         end;
$$;

-- 2 ─ CIE-10 ──────────────────────────────────────────────────────────────────────
create table if not exists public.cie10 (
  codigo       text primary key check (codigo ~ '^[A-Z][0-9]{2}(\.[0-9A-Z]{1,2})?$'),
  descripcion  text not null check (char_length(descripcion) between 2 and 300),
  capitulo     text,
  -- Cómo lo dice la gente ("dolor de cabeza", "presión alta"): solo para buscar; la descripción es la oficial.
  sinonimos    text check (char_length(sinonimos) <= 500),
  busqueda     text generated always as (lower(translate(codigo || ' ' || descripcion || ' ' || coalesce(sinonimos, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'))) stored
);
create index if not exists ix_cie10_busqueda on public.cie10 using gin (busqueda extensions.gin_trgm_ops);

-- Catálogo de referencia (no es dato de un hospital): lo lee cualquiera con sesión.
alter table public.cie10 enable row level security;
drop policy if exists cie10_select on public.cie10;
create policy cie10_select on public.cie10 for select to authenticated using (true);
revoke all on public.cie10 from anon, authenticated;
grant select on public.cie10 to authenticated;

-- Búsqueda por código ("I10", "m54") o por palabras ("dolor lumbar"), sin tildes.
create or replace function public.buscar_cie10(p_texto text, p_limite int default 20)
returns table (codigo text, descripcion text, capitulo text)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (select lower(translate(trim(coalesce(p_texto, '')), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) t)
  select c.codigo, c.descripcion, c.capitulo
    from public.cie10 c, q
   where q.t <> ''
     and (c.codigo ilike q.t || '%'
          or not exists (select 1 from unnest(string_to_array(q.t, ' ')) w where w <> '' and c.busqueda not like '%' || w || '%'))
   order by (c.codigo ilike q.t || '%') desc, length(c.codigo), c.codigo
   limit least(greatest(coalesce(p_limite, 20), 1), 50);
$$;

-- Carga del catálogo completo (superadmin): [{codigo, descripcion, capitulo?}, …].
create or replace function public.importar_cie10(p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f jsonb;
  n int := 0;
  malos int := 0;
begin
  if not privado.es_superadmin() then
    raise exception 'Solo la superadministración carga el catálogo CIE-10.' using errcode = '42501';
  end if;
  for f in select * from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) loop
    begin
      insert into public.cie10 (codigo, descripcion, capitulo)
      values (upper(trim(f ->> 'codigo')), trim(f ->> 'descripcion'), nullif(trim(coalesce(f ->> 'capitulo', '')), ''))
      on conflict (codigo) do update set descripcion = excluded.descripcion, capitulo = coalesce(excluded.capitulo, public.cie10.capitulo);
      n := n + 1;
    exception when others then
      malos := malos + 1;
    end;
  end loop;
  return jsonb_build_object('cargados', n, 'descartados', malos);
end;
$$;

revoke all on function public.buscar_cie10(text, int) from public, anon;
revoke all on function public.importar_cie10(jsonb) from public, anon;
grant execute on function public.buscar_cie10(text, int) to authenticated;
grant execute on function public.importar_cie10(jsonb) to authenticated;

-- Siembra: diagnósticos frecuentes en consulta ambulatoria y de urgencias (OPS, CIE-10).
insert into public.cie10 (codigo, descripcion, capitulo) values
  -- I · Infecciosas y parasitarias
  ('A09', 'Diarrea y gastroenteritis de presunto origen infeccioso', 'I'),
  ('A01.0', 'Fiebre tifoidea', 'I'),
  ('A15.0', 'Tuberculosis del pulmón, confirmada por hallazgo microscópico del bacilo tuberculoso en esputo', 'I'),
  ('A16.2', 'Tuberculosis de pulmón, sin mención de confirmación bacteriológica o histológica', 'I'),
  ('A27.9', 'Leptospirosis, no especificada', 'I'),
  ('A53.9', 'Sífilis, no especificada', 'I'),
  ('A54.9', 'Infección gonocócica, no especificada', 'I'),
  ('A90', 'Fiebre del dengue [dengue clásico]', 'I'),
  ('A91', 'Fiebre del dengue hemorrágico', 'I'),
  ('A92.0', 'Enfermedad por virus Chikungunya', 'I'),
  ('A92.5', 'Enfermedad por virus Zika', 'I'),
  ('B00.9', 'Infección debida al virus del herpes, no especificada', 'I'),
  ('B01.9', 'Varicela sin complicaciones', 'I'),
  ('B02.9', 'Herpes zóster sin complicaciones', 'I'),
  ('B05.9', 'Sarampión sin complicaciones', 'I'),
  ('B07', 'Verrugas víricas', 'I'),
  ('B15.9', 'Hepatitis aguda tipo A, sin coma hepático', 'I'),
  ('B16.9', 'Hepatitis aguda tipo B, sin agente delta y sin coma hepático', 'I'),
  ('B18.1', 'Hepatitis viral tipo B crónica, sin agente delta', 'I'),
  ('B18.2', 'Hepatitis viral tipo C crónica', 'I'),
  ('B20', 'Enfermedad por VIH, resultante en enfermedades infecciosas y parasitarias', 'I'),
  ('B24', 'Enfermedad por virus de la inmunodeficiencia humana [VIH], sin otra especificación', 'I'),
  ('B34.9', 'Infección viral, no especificada', 'I'),
  ('B35.1', 'Tiña de las uñas', 'I'),
  ('B35.3', 'Tiña del pie [tinea pedis]', 'I'),
  ('B35.4', 'Tiña del cuerpo [tinea corporis]', 'I'),
  ('B36.0', 'Pitiriasis versicolor', 'I'),
  ('B37.0', 'Estomatitis candidiásica', 'I'),
  ('B37.3', 'Candidiasis de la vulva y de la vagina', 'I'),
  ('B50.9', 'Paludismo debido a Plasmodium falciparum, sin otra especificación', 'I'),
  ('B54', 'Paludismo [malaria] no especificado', 'I'),
  ('B77.9', 'Ascariasis, no especificada', 'I'),
  ('B82.9', 'Parasitosis intestinal, sin otra especificación', 'I'),
  ('B86', 'Escabiosis', 'I'),
  ('U07.1', 'COVID-19, virus identificado', 'XXII'),
  ('U07.2', 'COVID-19, virus no identificado', 'XXII'),
  -- II · Tumores
  ('C50.9', 'Tumor maligno de la mama, parte no especificada', 'II'),
  ('C53.9', 'Tumor maligno del cuello del útero, sin otra especificación', 'II'),
  ('C61', 'Tumor maligno de la próstata', 'II'),
  ('C18.9', 'Tumor maligno del colon, parte no especificada', 'II'),
  ('D25.9', 'Leiomioma del útero, sin otra especificación', 'II'),
  -- III · Sangre
  ('D50.9', 'Anemia por deficiencia de hierro, sin otra especificación', 'III'),
  ('D57.1', 'Anemia falciforme sin crisis', 'III'),
  ('D64.9', 'Anemia de tipo no especificado', 'III'),
  -- IV · Endocrinas, nutricionales y metabólicas
  ('E03.9', 'Hipotiroidismo, no especificado', 'IV'),
  ('E05.9', 'Tirotoxicosis, hipertiroidismo sin otra especificación', 'IV'),
  ('E04.9', 'Bocio no tóxico, no especificado', 'IV'),
  ('E10.9', 'Diabetes mellitus insulinodependiente, sin mención de complicación', 'IV'),
  ('E11.9', 'Diabetes mellitus no insulinodependiente, sin mención de complicación', 'IV'),
  ('E11.6', 'Diabetes mellitus no insulinodependiente, con otras complicaciones especificadas', 'IV'),
  ('E11.5', 'Diabetes mellitus no insulinodependiente, con complicaciones circulatorias periféricas', 'IV'),
  ('E14.9', 'Diabetes mellitus no especificada, sin mención de complicación', 'IV'),
  ('E16.2', 'Hipoglicemia, no especificada', 'IV'),
  ('E28.2', 'Síndrome de ovario poliquístico', 'IV'),
  ('E44.0', 'Desnutrición proteicocalórica moderada', 'IV'),
  ('E46', 'Desnutrición proteicocalórica, no especificada', 'IV'),
  ('E55.9', 'Deficiencia de vitamina D, no especificada', 'IV'),
  ('E66.9', 'Obesidad, no especificada', 'IV'),
  ('E78.0', 'Hipercolesterolemia pura', 'IV'),
  ('E78.1', 'Hipergliceridemia pura', 'IV'),
  ('E78.5', 'Hiperlipidemia no especificada', 'IV'),
  ('E79.0', 'Hiperuricemia sin signos de artritis inflamatoria y enfermedad tofácea', 'IV'),
  ('E86', 'Depleción del volumen (deshidratación)', 'IV'),
  ('E87.6', 'Hipopotasemia', 'IV'),
  -- V · Mentales y del comportamiento
  ('F10.2', 'Trastornos mentales y del comportamiento debidos al uso de alcohol: síndrome de dependencia', 'V'),
  ('F17.2', 'Trastornos mentales y del comportamiento debidos al uso de tabaco: síndrome de dependencia', 'V'),
  ('F20.9', 'Esquizofrenia, no especificada', 'V'),
  ('F31.9', 'Trastorno afectivo bipolar, no especificado', 'V'),
  ('F32.9', 'Episodio depresivo, no especificado', 'V'),
  ('F33.9', 'Trastorno depresivo recurrente, no especificado', 'V'),
  ('F41.0', 'Trastorno de pánico [ansiedad paroxística episódica]', 'V'),
  ('F41.1', 'Trastorno de ansiedad generalizada', 'V'),
  ('F41.2', 'Trastorno mixto de ansiedad y depresión', 'V'),
  ('F41.9', 'Trastorno de ansiedad, no especificado', 'V'),
  ('F43.1', 'Trastorno de estrés postraumático', 'V'),
  ('F43.2', 'Trastornos de adaptación', 'V'),
  ('F51.0', 'Insomnio no orgánico', 'V'),
  ('F84.0', 'Autismo en la niñez', 'V'),
  ('F90.0', 'Perturbación de la actividad y de la atención', 'V'),
  -- VI · Sistema nervioso
  ('G40.9', 'Epilepsia, tipo no especificado', 'VI'),
  ('G43.9', 'Migraña, no especificada', 'VI'),
  ('G44.2', 'Cefalea debida a tensión', 'VI'),
  ('G45.9', 'Isquemia cerebral transitoria, sin otra especificación', 'VI'),
  ('G47.0', 'Trastornos del inicio y del mantenimiento del sueño [insomnios]', 'VI'),
  ('G51.0', 'Parálisis de Bell', 'VI'),
  ('G56.0', 'Síndrome del túnel carpiano', 'VI'),
  ('G62.9', 'Polineuropatía, no especificada', 'VI'),
  ('G63.2', 'Polineuropatía diabética', 'VI'),
  ('G20', 'Enfermedad de Parkinson', 'VI'),
  ('G30.9', 'Enfermedad de Alzheimer, no especificada', 'VI'),
  -- VII · Ojo
  ('H10.9', 'Conjuntivitis, no especificada', 'VII'),
  ('H10.1', 'Conjuntivitis atópica aguda', 'VII'),
  ('H00.0', 'Orzuelo y otras inflamaciones profundas del párpado', 'VII'),
  ('H25.9', 'Catarata senil, no especificada', 'VII'),
  ('H40.9', 'Glaucoma, no especificado', 'VII'),
  ('H52.1', 'Miopía', 'VII'),
  ('H52.4', 'Presbicia', 'VII'),
  ('H57.1', 'Dolor ocular', 'VII'),
  -- VIII · Oído
  ('H60.9', 'Otitis externa, sin otra especificación', 'VIII'),
  ('H61.2', 'Cerumen impactado', 'VIII'),
  ('H65.9', 'Otitis media no supurativa, sin otra especificación', 'VIII'),
  ('H66.9', 'Otitis media, no especificada', 'VIII'),
  ('H81.1', 'Vértigo paroxístico benigno', 'VIII'),
  ('H91.9', 'Hipoacusia, no especificada', 'VIII'),
  ('H92.0', 'Otalgia', 'VIII'),
  -- IX · Circulatorio
  ('I10', 'Hipertensión esencial (primaria)', 'IX'),
  ('I11.9', 'Enfermedad cardíaca hipertensiva sin insuficiencia cardíaca (congestiva)', 'IX'),
  ('I15.9', 'Hipertensión secundaria, no especificada', 'IX'),
  ('I20.9', 'Angina de pecho, no especificada', 'IX'),
  ('I21.9', 'Infarto agudo del miocardio, sin otra especificación', 'IX'),
  ('I25.9', 'Enfermedad isquémica crónica del corazón, no especificada', 'IX'),
  ('I48', 'Fibrilación y aleteo auricular', 'IX'),
  ('I49.9', 'Arritmia cardíaca, no especificada', 'IX'),
  ('I50.9', 'Insuficiencia cardíaca, no especificada', 'IX'),
  ('I63.9', 'Infarto cerebral, no especificado', 'IX'),
  ('I64', 'Accidente vascular encefálico agudo, no especificado como hemorrágico o isquémico', 'IX'),
  ('I69.4', 'Secuelas de accidente vascular encefálico, no especificado como hemorrágico o de infarto', 'IX'),
  ('I73.9', 'Enfermedad vascular periférica, no especificada', 'IX'),
  ('I80.2', 'Flebitis y tromboflebitis de otros vasos profundos de los miembros inferiores', 'IX'),
  ('I83.9', 'Venas varicosas de los miembros inferiores sin úlcera ni inflamación', 'IX'),
  ('I84.9', 'Hemorroides no especificadas, sin complicación', 'IX'),
  ('I95.9', 'Hipotensión, no especificada', 'IX'),
  -- X · Respiratorio
  ('J00', 'Rinofaringitis aguda [resfriado común]', 'X'),
  ('J01.9', 'Sinusitis aguda, no especificada', 'X'),
  ('J02.9', 'Faringitis aguda, no especificada', 'X'),
  ('J03.9', 'Amigdalitis aguda, no especificada', 'X'),
  ('J04.0', 'Laringitis aguda', 'X'),
  ('J06.9', 'Infección aguda de las vías respiratorias superiores, no especificada', 'X'),
  ('J10.1', 'Influenza con otras manifestaciones respiratorias, debida a virus de la influenza identificado', 'X'),
  ('J11.1', 'Influenza con otras manifestaciones respiratorias, virus no identificado', 'X'),
  ('J15.9', 'Neumonía bacteriana, no especificada', 'X'),
  ('J18.9', 'Neumonía, no especificada', 'X'),
  ('J20.9', 'Bronquitis aguda, no especificada', 'X'),
  ('J21.9', 'Bronquiolitis aguda, no especificada', 'X'),
  ('J30.4', 'Rinitis alérgica, no especificada', 'X'),
  ('J31.0', 'Rinitis crónica', 'X'),
  ('J32.9', 'Sinusitis crónica, no especificada', 'X'),
  ('J40', 'Bronquitis, no especificada como aguda o crónica', 'X'),
  ('J44.9', 'Enfermedad pulmonar obstructiva crónica, no especificada', 'X'),
  ('J45.9', 'Asma, no especificada', 'X'),
  ('J46', 'Estado asmático', 'X'),
  -- XI · Digestivo
  ('K02.9', 'Caries dental, no especificada', 'XI'),
  ('K04.7', 'Absceso periapical sin fístula', 'XI'),
  ('K05.1', 'Gingivitis crónica', 'XI'),
  ('K08.1', 'Pérdida de dientes debida a accidente, extracción o enfermedad periodontal local', 'XI'),
  ('K12.0', 'Estomatitis aftosa recurrente', 'XI'),
  ('K21.9', 'Enfermedad del reflujo gastroesofágico sin esofagitis', 'XI'),
  ('K25.9', 'Úlcera gástrica, no especificada como aguda ni crónica, sin hemorragia ni perforación', 'XI'),
  ('K29.7', 'Gastritis, no especificada', 'XI'),
  ('K30', 'Dispepsia', 'XI'),
  ('K35.8', 'Apendicitis aguda, otra y la no especificada', 'XI'),
  ('K40.9', 'Hernia inguinal unilateral o no especificada, sin obstrucción ni gangrena', 'XI'),
  ('K42.9', 'Hernia umbilical sin obstrucción ni gangrena', 'XI'),
  ('K52.9', 'Colitis y gastroenteritis no infecciosas, no especificadas', 'XI'),
  ('K57.9', 'Enfermedad diverticular del intestino, de parte no especificada, sin perforación ni absceso', 'XI'),
  ('K58.9', 'Síndrome del colon irritable sin diarrea', 'XI'),
  ('K59.0', 'Constipación', 'XI'),
  ('K60.2', 'Fisura anal, no especificada', 'XI'),
  ('K76.0', 'Degeneración grasa del hígado, no clasificada en otra parte', 'XI'),
  ('K80.2', 'Cálculo de la vesícula biliar sin colecistitis', 'XI'),
  ('K81.9', 'Colecistitis, no especificada', 'XI'),
  ('K92.2', 'Hemorragia gastrointestinal, no especificada', 'XI'),
  -- XII · Piel
  ('L01.0', 'Impétigo [cualquier sitio anatómico] [cualquier organismo]', 'XII'),
  ('L02.9', 'Absceso cutáneo, furúnculo y ántrax, de sitio no especificado', 'XII'),
  ('L03.9', 'Celulitis de sitio no especificado', 'XII'),
  ('L20.9', 'Dermatitis atópica, no especificada', 'XII'),
  ('L23.9', 'Dermatitis alérgica de contacto, de causa no especificada', 'XII'),
  ('L30.9', 'Dermatitis, no especificada', 'XII'),
  ('L40.9', 'Psoriasis, no especificada', 'XII'),
  ('L50.9', 'Urticaria, no especificada', 'XII'),
  ('L60.0', 'Uña encarnada', 'XII'),
  ('L70.0', 'Acné vulgar', 'XII'),
  ('L89.9', 'Úlcera de decúbito y por presión, de sitio no especificado', 'XII'),
  ('L97', 'Úlcera de miembro inferior, no clasificada en otra parte', 'XII'),
  -- XIII · Osteomuscular (dolores)
  ('M10.9', 'Gota, no especificada', 'XIII'),
  ('M13.9', 'Artritis, no especificada', 'XIII'),
  ('M06.9', 'Artritis reumatoide, no especificada', 'XIII'),
  ('M15.9', 'Poliartrosis, no especificada', 'XIII'),
  ('M17.9', 'Gonartrosis, no especificada', 'XIII'),
  ('M16.9', 'Coxartrosis, no especificada', 'XIII'),
  ('M19.9', 'Artrosis, no especificada', 'XIII'),
  ('M25.5', 'Dolor en articulación', 'XIII'),
  ('M32.9', 'Lupus eritematoso sistémico, sin otra especificación', 'XIII'),
  ('M47.9', 'Espondilosis, no especificada', 'XIII'),
  ('M51.2', 'Otros desplazamientos especificados de disco intervertebral', 'XIII'),
  ('M54.1', 'Radiculopatía', 'XIII'),
  ('M54.2', 'Cervicalgia', 'XIII'),
  ('M54.3', 'Ciática', 'XIII'),
  ('M54.4', 'Lumbago con ciática', 'XIII'),
  ('M54.5', 'Lumbago no especificado', 'XIII'),
  ('M54.6', 'Dolor en la columna dorsal', 'XIII'),
  ('M54.9', 'Dorsalgia, no especificada', 'XIII'),
  ('M62.6', 'Distensión muscular', 'XIII'),
  ('M65.9', 'Sinovitis y tenosinovitis, no especificada', 'XIII'),
  ('M75.1', 'Síndrome de manguito rotatorio', 'XIII'),
  ('M77.1', 'Epicondilitis lateral', 'XIII'),
  ('M79.1', 'Mialgia', 'XIII'),
  ('M79.6', 'Dolor en miembro', 'XIII'),
  ('M79.7', 'Fibromialgia', 'XIII'),
  ('M81.9', 'Osteoporosis, no especificada', 'XIII'),
  -- XIV · Genitourinario
  ('N18.9', 'Enfermedad renal crónica, no especificada', 'XIV'),
  ('N20.0', 'Cálculo del riñón', 'XIV'),
  ('N23', 'Cólico renal, no especificado', 'XIV'),
  ('N30.0', 'Cistitis aguda', 'XIV'),
  ('N39.0', 'Infección de vías urinarias, sitio no especificado', 'XIV'),
  ('N40', 'Hiperplasia de la próstata', 'XIV'),
  ('N60.1', 'Mastopatía quística difusa', 'XIV'),
  ('N63', 'Masa no especificada en la mama', 'XIV'),
  ('N64.4', 'Mastodinia', 'XIV'),
  ('N76.0', 'Vaginitis aguda', 'XIV'),
  ('N77.1', 'Vaginitis, vulvitis y vulvovaginitis en enfermedades infecciosas y parasitarias clasificadas en otra parte', 'XIV'),
  ('N83.2', 'Otros quistes ováricos y los no especificados', 'XIV'),
  ('N91.2', 'Amenorrea, sin otra especificación', 'XIV'),
  ('N92.0', 'Menstruación excesiva y frecuente con ciclo regular', 'XIV'),
  ('N92.6', 'Menstruación irregular, no especificada', 'XIV'),
  ('N94.6', 'Dismenorrea, no especificada', 'XIV'),
  ('N95.1', 'Estados menopáusicos y climatéricos femeninos', 'XIV'),
  ('N97.9', 'Infertilidad femenina, no especificada', 'XIV'),
  -- XV · Embarazo, parto y puerperio
  ('O03.9', 'Aborto espontáneo completo o no especificado, sin complicación', 'XV'),
  ('O13', 'Hipertensión gestacional [inducida por el embarazo] sin proteinuria significativa', 'XV'),
  ('O14.9', 'Preeclampsia, no especificada', 'XV'),
  ('O20.0', 'Amenaza de aborto', 'XV'),
  ('O21.0', 'Hiperemesis gravídica leve', 'XV'),
  ('O23.4', 'Infección no especificada de las vías urinarias en el embarazo', 'XV'),
  ('O24.4', 'Diabetes mellitus que se origina con el embarazo', 'XV'),
  ('O47.9', 'Falso trabajo de parto, sin otra especificación', 'XV'),
  ('O80.9', 'Parto único espontáneo, sin otra especificación', 'XV'),
  ('O82.9', 'Parto por cesárea, sin otra especificación', 'XV'),
  ('O99.0', 'Anemia que complica el embarazo, el parto y el puerperio', 'XV'),
  -- XVI–XVII · Perinatal y congénitas
  ('P07.3', 'Otros recién nacidos pretérmino', 'XVI'),
  ('P59.9', 'Ictericia neonatal, no especificada', 'XVI'),
  ('Q21.0', 'Defecto del tabique ventricular', 'XVII'),
  ('Q90.9', 'Síndrome de Down, no especificado', 'XVII'),
  -- XVIII · Síntomas, signos y hallazgos (dolores, fiebre…)
  ('R04.0', 'Epistaxis', 'XVIII'),
  ('R05', 'Tos', 'XVIII'),
  ('R06.0', 'Disnea', 'XVIII'),
  ('R07.0', 'Dolor de garganta', 'XVIII'),
  ('R07.1', 'Dolor en el pecho al respirar', 'XVIII'),
  ('R07.4', 'Dolor en el pecho, no especificado', 'XVIII'),
  ('R10.0', 'Abdomen agudo', 'XVIII'),
  ('R10.1', 'Dolor abdominal localizado en parte superior', 'XVIII'),
  ('R10.3', 'Dolor localizado en otras partes inferiores del abdomen', 'XVIII'),
  ('R10.4', 'Otros dolores abdominales y los no especificados', 'XVIII'),
  ('R11', 'Náusea y vómito', 'XVIII'),
  ('R17', 'Ictericia no especificada', 'XVIII'),
  ('R19.7', 'Diarrea, no especificada', 'XVIII'),
  ('R21', 'Salpullido y otras erupciones cutáneas no específicas', 'XVIII'),
  ('R25.2', 'Calambres y espasmos', 'XVIII'),
  ('R30.0', 'Disuria', 'XVIII'),
  ('R31', 'Hematuria, no especificada', 'XVIII'),
  ('R35', 'Poliuria', 'XVIII'),
  ('R42', 'Mareo y desvanecimiento', 'XVIII'),
  ('R50.9', 'Fiebre, no especificada', 'XVIII'),
  ('R51', 'Cefalea', 'XVIII'),
  ('R52.0', 'Dolor agudo', 'XVIII'),
  ('R52.2', 'Otro dolor crónico', 'XVIII'),
  ('R52.9', 'Dolor, no especificado', 'XVIII'),
  ('R53', 'Malestar y fatiga', 'XVIII'),
  ('R55', 'Síncope y colapso', 'XVIII'),
  ('R56.0', 'Convulsiones febriles', 'XVIII'),
  ('R60.0', 'Edema localizado', 'XVIII'),
  ('R63.4', 'Pérdida anormal de peso', 'XVIII'),
  ('R73.0', 'Anormalidades en la prueba de tolerancia a la glucosa', 'XVIII'),
  ('R73.9', 'Hiperglicemia, no especificada', 'XVIII'),
  -- XIX · Traumatismos y envenenamientos
  ('S00.9', 'Traumatismo superficial de la cabeza, parte no especificada', 'XIX'),
  ('S06.0', 'Concusión', 'XIX'),
  ('S09.9', 'Traumatismo de la cabeza, no especificado', 'XIX'),
  ('S13.4', 'Esguince y torcedura de la columna cervical', 'XIX'),
  ('S33.5', 'Esguince y torcedura de la columna lumbar', 'XIX'),
  ('S42.0', 'Fractura de la clavícula', 'XIX'),
  ('S52.5', 'Fractura de la epífisis inferior del radio', 'XIX'),
  ('S61.9', 'Herida de la muñeca y de la mano, parte no especificada', 'XIX'),
  ('S62.6', 'Fractura de otro dedo de la mano', 'XIX'),
  ('S63.5', 'Esguince y torcedura de la muñeca', 'XIX'),
  ('S72.0', 'Fractura del cuello del fémur', 'XIX'),
  ('S82.6', 'Fractura del maléolo externo', 'XIX'),
  ('S83.6', 'Esguince y torcedura de otras partes y las no especificadas de la rodilla', 'XIX'),
  ('S91.3', 'Herida de otras partes del pie', 'XIX'),
  ('S93.4', 'Esguince y torcedura del tobillo', 'XIX'),
  ('T14.0', 'Traumatismo superficial de región no especificada del cuerpo', 'XIX'),
  ('T14.1', 'Herida de región no especificada del cuerpo', 'XIX'),
  ('T30.0', 'Quemadura de región del cuerpo y grado no especificados', 'XIX'),
  ('T63.4', 'Efecto tóxico del veneno de otros artrópodos', 'XIX'),
  ('T78.4', 'Alergia no especificada', 'XIX'),
  ('T78.3', 'Edema angioneurótico', 'XIX'),
  -- XX · Causas externas
  ('W19', 'Caída no especificada', 'XX'),
  ('W54', 'Mordedura o ataque de perro', 'XX'),
  ('V89.2', 'Persona lesionada en accidente de tránsito de vehículo de motor no especificado', 'XX'),
  ('X44', 'Envenenamiento accidental por, y exposición a otras drogas, medicamentos y sustancias biológicas, y las no especificadas', 'XX'),
  -- XXI · Factores que influyen en el estado de salud (controles)
  ('Z00.0', 'Examen médico general', 'XXI'),
  ('Z00.1', 'Control de salud de rutina del niño', 'XXI'),
  ('Z01.2', 'Examen odontológico', 'XXI'),
  ('Z01.4', 'Examen ginecológico (general) (de rutina)', 'XXI'),
  ('Z02.7', 'Extensión de certificado médico', 'XXI'),
  ('Z09.9', 'Examen de seguimiento consecutivo a tratamiento no especificado por otras afecciones', 'XXI'),
  ('Z11.4', 'Examen de pesquisa especial para la infección debida al virus de la inmunodeficiencia humana [VIH]', 'XXI'),
  ('Z12.4', 'Examen de pesquisa especial para tumor del cuello uterino', 'XXI'),
  ('Z23.9', 'Necesidad de inmunización contra enfermedad bacteriana única no especificada', 'XXI'),
  ('Z27.1', 'Necesidad de inmunización contra la difteria-tos ferina-tétanos combinados [DPT]', 'XXI'),
  ('Z30.0', 'Consejo y asesoramiento general sobre la anticoncepción', 'XXI'),
  ('Z30.4', 'Supervisión del uso de drogas anticonceptivas', 'XXI'),
  ('Z32.1', 'Embarazo confirmado', 'XXI'),
  ('Z34.0', 'Supervisión de primer embarazo normal', 'XXI'),
  ('Z34.9', 'Supervisión de embarazo normal no especificado', 'XXI'),
  ('Z35.9', 'Supervisión de embarazo de alto riesgo, sin otra especificación', 'XXI'),
  ('Z39.2', 'Seguimiento postparto, de rutina', 'XXI'),
  ('Z48.0', 'Atención de los apósitos y suturas', 'XXI'),
  ('Z71.3', 'Consulta para instrucción y vigilancia de la dieta', 'XXI'),
  ('Z76.0', 'Consulta para repetición de receta', 'XXI')
on conflict (codigo) do nothing;

-- Sinónimos de uso común (búsqueda): el término oficial no siempre es el que se escribe en consulta.
update public.cie10 c set sinonimos = s.sin
  from (values
    ('M54.5', 'dolor lumbar dolor de espalda baja dolor de cintura'),
    ('M54.4', 'dolor lumbar con ciatica dolor de espalda que baja a la pierna'),
    ('M54.9', 'dolor de espalda'),
    ('M54.6', 'dolor de espalda alta'),
    ('M54.2', 'dolor de cuello'),
    ('M25.5', 'dolor de rodilla dolor de hombro dolor de codo dolor de cadera dolor de tobillo dolor de muñeca'),
    ('M79.6', 'dolor de pierna dolor de brazo dolor de pie dolor de mano'),
    ('M79.1', 'dolor muscular dolor de cuerpo'),
    ('R51', 'dolor de cabeza'),
    ('G44.2', 'dolor de cabeza tensional'),
    ('G43.9', 'jaqueca dolor de cabeza'),
    ('R10.4', 'dolor de barriga dolor de estomago dolor abdominal colico'),
    ('R10.1', 'dolor de boca del estomago epigastralgia'),
    ('R10.3', 'dolor bajo vientre dolor pelvico'),
    ('R07.4', 'dolor de pecho dolor toracico'),
    ('R07.0', 'dolor al tragar'),
    ('H92.0', 'dolor de oido'),
    ('H57.1', 'dolor de ojo'),
    ('K02.9', 'dolor de muela dolor de diente'),
    ('K04.7', 'dolor de muela absceso dental flemon'),
    ('N94.6', 'dolor menstrual colicos menstruales regla dolorosa'),
    ('N64.4', 'dolor de seno dolor de mama'),
    ('N23', 'dolor de riñon'),
    ('R30.0', 'ardor al orinar dolor al orinar'),
    ('R52.9', 'dolor'),
    ('I10', 'presion alta tension alta hta'),
    ('I95.9', 'presion baja tension baja'),
    ('E11.9', 'diabetes azucar alta dm2'),
    ('E14.9', 'diabetes azucar'),
    ('E16.2', 'azucar baja'),
    ('E78.5', 'colesterol alto trigliceridos altos'),
    ('E66.9', 'sobrepeso gordura'),
    ('J00', 'gripe catarro resfriado'),
    ('J11.1', 'gripe influenza'),
    ('J02.9', 'dolor de garganta faringitis'),
    ('J06.9', 'gripe infeccion respiratoria ira'),
    ('R05', 'tos seca tos con flema'),
    ('R50.9', 'fiebre calentura'),
    ('A09', 'diarrea vomitos gastroenteritis'),
    ('R11', 'vomitos ganas de vomitar'),
    ('K29.7', 'gastritis acidez'),
    ('K21.9', 'reflujo acidez agruras'),
    ('K59.0', 'estreñimiento estrenimiento'),
    ('N39.0', 'infeccion de orina itu'),
    ('B37.3', 'hongos vaginales candidiasis'),
    ('B35.4', 'hongos en la piel'),
    ('B86', 'sarna'),
    ('L50.9', 'ronchas alergia en la piel'),
    ('T78.4', 'alergia reaccion alergica'),
    ('F41.9', 'nervios ansiedad'),
    ('F32.9', 'depresion tristeza'),
    ('G47.0', 'no puede dormir insomnio'),
    ('R42', 'mareo vertigo'),
    ('H81.1', 'vertigo mareo'),
    ('D64.9', 'anemia sangre baja'),
    ('Z34.9', 'control prenatal embarazo'),
    ('Z00.0', 'chequeo general control chequeo medico'),
    ('Z00.1', 'control del niño sano'),
    ('Z76.0', 'repetir receta'),
    ('T14.1', 'herida cortadura'),
    ('S93.4', 'torcedura de tobillo'),
    ('W54', 'mordida de perro')
  ) as s (codigo, sin)
 where c.codigo = s.codigo;