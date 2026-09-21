--
-- PostgreSQL database dump
--

\restrict Driu2e7qLyge3J6ziHfJtGBEZPDdN8pygZix0VBoaRaayGhsFjkkEG5IpSStLSw

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.turnos DROP CONSTRAINT IF EXISTS "FK_turnos_zonaEventoId";
ALTER TABLE IF EXISTS ONLY public.registros_asistencia DROP CONSTRAINT IF EXISTS "FK_e97bdf07f2a4cd7f656fd38f1fb";
ALTER TABLE IF EXISTS ONLY public.solicitudes_cambio_turno DROP CONSTRAINT IF EXISTS "FK_c60738ca5893cf2f2319ac0ddfc";
ALTER TABLE IF EXISTS ONLY public.solicitudes_cambio_turno DROP CONSTRAINT IF EXISTS "FK_90265cb7c155bcd529c4d0593e4";
ALTER TABLE IF EXISTS ONLY public.registros_asistencia DROP CONSTRAINT IF EXISTS "FK_6ad00b1b983aca3e96d1f6a363d";
ALTER TABLE IF EXISTS ONLY public.turnos DROP CONSTRAINT IF EXISTS "FK_24a00e0a11e8b29c0e4cde602f9";
ALTER TABLE IF EXISTS ONLY public.empleados DROP CONSTRAINT IF EXISTS "UQ_d895bb4248c3f09e87f99f4a4f9";
ALTER TABLE IF EXISTS ONLY public.registros_asistencia DROP CONSTRAINT IF EXISTS "UQ_859a5354105c601691073964a20";
ALTER TABLE IF EXISTS ONLY public.empleados DROP CONSTRAINT IF EXISTS "UQ_149783bdb3291033ccd3ef9ee39";
ALTER TABLE IF EXISTS ONLY public.zonas_evento DROP CONSTRAINT IF EXISTS "PK_zonas_evento_id";
ALTER TABLE IF EXISTS ONLY public.migraciones DROP CONSTRAINT IF EXISTS "PK_c790b3af92e49234538c56f4abb";
ALTER TABLE IF EXISTS ONLY public.notificaciones DROP CONSTRAINT IF EXISTS "PK_a9d32a419ff58b53a38b5ef85d4";
ALTER TABLE IF EXISTS ONLY public.empleados DROP CONSTRAINT IF EXISTS "PK_73a63a6fcb4266219be3eb0ce8a";
ALTER TABLE IF EXISTS ONLY public.turnos DROP CONSTRAINT IF EXISTS "PK_61dbaea0fc136ee2ef981f14782";
ALTER TABLE IF EXISTS ONLY public.solicitudes_cambio_turno DROP CONSTRAINT IF EXISTS "PK_5c40f0257b0ef8e3eb9674c0d99";
ALTER TABLE IF EXISTS ONLY public.registros_asistencia DROP CONSTRAINT IF EXISTS "PK_36b13209a79c9e8898f70bcd5e6";
ALTER TABLE IF EXISTS public.migraciones ALTER COLUMN id DROP DEFAULT;
DROP TABLE IF EXISTS public.zonas_evento;
DROP TABLE IF EXISTS public.turnos;
DROP TABLE IF EXISTS public.solicitudes_cambio_turno;
DROP TABLE IF EXISTS public.registros_asistencia;
DROP TABLE IF EXISTS public.notificaciones;
DROP SEQUENCE IF EXISTS public.migraciones_id_seq;
DROP TABLE IF EXISTS public.migraciones;
DROP TABLE IF EXISTS public.empleados;
DROP TYPE IF EXISTS public.turnos_estado_enum;
DROP TYPE IF EXISTS public.solicitudes_cambio_turno_estado_enum;
DROP TYPE IF EXISTS public.registros_asistencia_tipo_enum;
DROP EXTENSION IF EXISTS "uuid-ossp";
-- *not* dropping schema, since initdb creates it
--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: registros_asistencia_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.registros_asistencia_tipo_enum AS ENUM (
    'ENTRADA',
    'SALIDA'
);


--
-- Name: solicitudes_cambio_turno_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.solicitudes_cambio_turno_estado_enum AS ENUM (
    'PENDIENTE',
    'SIN_REEMPLAZO',
    'APROBADA',
    'RECHAZADA',
    'BLOQUEADA_POR_HORAS'
);


--
-- Name: turnos_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.turnos_estado_enum AS ENUM (
    'ASIGNADO',
    'CAMBIO_SOLICITADO',
    'CAMBIADO',
    'CANCELADO'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: empleados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empleados (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "usuarioId" uuid NOT NULL,
    nombre character varying NOT NULL,
    rol character varying NOT NULL,
    credencial character varying NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    "horasTrabajadasTotales" double precision DEFAULT '0'::double precision NOT NULL
);


--
-- Name: migraciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migraciones (
    id integer NOT NULL,
    "timestamp" bigint NOT NULL,
    name character varying NOT NULL
);


--
-- Name: migraciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.migraciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: migraciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.migraciones_id_seq OWNED BY public.migraciones.id;


--
-- Name: notificaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notificaciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo character varying NOT NULL,
    "turnoId" character varying NOT NULL,
    "empleadoId" character varying NOT NULL,
    mensaje character varying NOT NULL,
    "latenciaMs" double precision NOT NULL,
    "recibidoEn" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: registros_asistencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registros_asistencia (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "empleadoId" uuid NOT NULL,
    "turnoId" uuid,
    tipo public.registros_asistencia_tipo_enum NOT NULL,
    "credencialUsada" character varying NOT NULL,
    anomalia boolean DEFAULT false NOT NULL,
    "motivoAnomalia" character varying,
    "horasCalculadas" double precision,
    "timestamp" timestamp with time zone NOT NULL,
    "idempotencyKey" character varying,
    "sincronizadoEn" timestamp with time zone NOT NULL
);


--
-- Name: solicitudes_cambio_turno; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solicitudes_cambio_turno (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "turnoId" uuid NOT NULL,
    motivo character varying NOT NULL,
    "empleadoReemplazoId" uuid,
    estado public.solicitudes_cambio_turno_estado_enum DEFAULT 'PENDIENTE'::public.solicitudes_cambio_turno_estado_enum NOT NULL,
    "revisadoPorId" character varying,
    "motivoRechazoOBloqueo" character varying,
    "fechaSolicitud" timestamp with time zone DEFAULT now() NOT NULL,
    "fechaRevision" timestamp with time zone
);


--
-- Name: turnos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.turnos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "empleadoId" uuid NOT NULL,
    "eventoId" character varying NOT NULL,
    zona character varying NOT NULL,
    "horaInicio" timestamp with time zone NOT NULL,
    "horaFin" timestamp with time zone NOT NULL,
    estado public.turnos_estado_enum DEFAULT 'ASIGNADO'::public.turnos_estado_enum NOT NULL,
    "zonaEventoId" uuid
);


--
-- Name: zonas_evento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zonas_evento (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "eventoId" character varying NOT NULL,
    nombre character varying NOT NULL,
    "rolRequerido" character varying NOT NULL,
    "personalRequerido" integer NOT NULL
);


--
-- Name: migraciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migraciones ALTER COLUMN id SET DEFAULT nextval('public.migraciones_id_seq'::regclass);


--
-- Data for Name: empleados; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.empleados (id, "usuarioId", nombre, rol, credencial, activo, "horasTrabajadasTotales") FROM stdin;
f57a7cd8-ee97-43bf-8f30-59945c60eba2	a0000004-0000-4000-8000-000000000004	Luis Ramírez	Entrada	personal@hexacore.com	t	0
6c647f19-e6de-42ea-8046-cb5a29f9047c	a0000008-0000-4000-8000-000000000008	Marta Gómez	Parqueadero	parqueadero@hexacore.com	t	0
4c0608f3-9e6e-4ef5-ab5d-8c4e031b386d	a0000009-0000-4000-8000-000000000009	Carlos Peña	Restaurante	restaurante@hexacore.com	t	0
23374dd9-2abc-4805-8fa9-73f2d9a33b7a	a0000010-0000-4000-8000-000000000010	Isabel Rojas	Jefe de personal	jefepersonal@hexacore.com	t	0
d3f1fe6a-8673-4018-bb5f-8e69d7be8297	a0000011-0000-4000-8000-000000000011	Sofía Vargas	Entrada	reemplazo@hexacore.com	t	0
\.


--
-- Data for Name: migraciones; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.migraciones (id, "timestamp", name) FROM stdin;
1	1789718400000	EsquemaInicialCu0181789718400000
2	1789750000000	Cu017PersonalOperativo1789750000000
\.


--
-- Data for Name: notificaciones; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notificaciones (id, tipo, "turnoId", "empleadoId", mensaje, "latenciaMs", "recibidoEn") FROM stdin;
\.


--
-- Data for Name: registros_asistencia; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.registros_asistencia (id, "empleadoId", "turnoId", tipo, "credencialUsada", anomalia, "motivoAnomalia", "horasCalculadas", "timestamp", "idempotencyKey", "sincronizadoEn") FROM stdin;
\.


--
-- Data for Name: solicitudes_cambio_turno; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.solicitudes_cambio_turno (id, "turnoId", motivo, "empleadoReemplazoId", estado, "revisadoPorId", "motivoRechazoOBloqueo", "fechaSolicitud", "fechaRevision") FROM stdin;
\.


--
-- Data for Name: turnos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.turnos (id, "empleadoId", "eventoId", zona, "horaInicio", "horaFin", estado, "zonaEventoId") FROM stdin;
cb0d88f0-4e87-4b6f-b23a-ab7cc0a4eff8	f57a7cd8-ee97-43bf-8f30-59945c60eba2	evt-1	Puerta Norte	2026-09-21 00:55:13.821+00	2026-09-21 08:55:13.821+00	ASIGNADO	\N
\.


--
-- Data for Name: zonas_evento; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.zonas_evento (id, "eventoId", nombre, "rolRequerido", "personalRequerido") FROM stdin;
76a956d8-aa9b-4864-a8fb-5214ad5eb8f4	evento-bb79d4cd-5b74-4a15-bb4b-1a1cea5905cf	zona-norte	entrada-07c7b348-d02c-4a85-9538-0b71c4ca64c2	1
5375372b-ef30-4662-a74f-260fc3d6a787	evento-5eaa4f6d-ad0b-4e59-9703-d3adbfb03c40	zona-norte	rol-y-b5736ba8-594a-414e-8222-a6e01c247d7e	1
f395efdd-cbd9-416b-a13c-7acd63dd48e2	evento-5187f38e-26c3-4341-beb9-0df9b0eac3d7	zona-norte	entrada-0cdcf636-970c-4f84-a5b2-925ed5217b3b	1
28fdb798-ec3c-4c0e-82f6-44c1f19698cd	evento-5187f38e-26c3-4341-beb9-0df9b0eac3d7	zona-norte	entrada-0cdcf636-970c-4f84-a5b2-925ed5217b3b	1
48491b6b-f534-4293-a88b-5120bc03e09e	evento-69a7a641-c80e-401c-85d9-79681ebbb759	zona-norte	entrada-3297aed2-353d-41c1-96ab-4ce2d68fad72	3
f50014f2-fc66-429c-819c-dbb1f24b2036	evento-f0794487-985b-4732-a2fb-541551a8ca16	zona-norte	entrada-fe3e9287-ca22-4786-b313-4e84415d343e	1
ad0d1da3-b02c-49a6-ba87-31caa5cbfe99	evento-3e1c2402-85fb-4183-8874-ed58e619b7a8	zona-norte	entrada-7a1ff415-3b5f-4e8b-a168-1e9c95bc8781	1
e83de021-b6cb-4879-982c-690ba192a3cc	evento-7a2dbcf9-71ea-4600-b515-ad0e83b9eeac	zona-norte	rol-z	1
c7ed7404-0b77-488f-8533-ce437174e6d3	evento-6a6b15ed-59b3-44bd-8474-e32873d850db	zona-norte	entrada-25af5f2a-ff37-4184-a37c-358899a47b35	1
4496e90e-d4dd-451e-9f62-941c890f5452	evento-b8778f3b-72d5-472d-92ae-fe2e54b79727	zona-norte	rol-y-e1134677-c129-4933-ad73-0250c8677d7f	1
0159118e-6724-4837-a78f-e2c4b7f9d069	evento-ec0c91d2-996e-4af2-986a-db73ea5308ef	zona-norte	entrada-d0138ddd-dee1-43ff-99ac-a1944bcbed23	1
d147fca3-309c-4a00-92b9-779a7a31b75a	evento-ec0c91d2-996e-4af2-986a-db73ea5308ef	zona-norte	entrada-d0138ddd-dee1-43ff-99ac-a1944bcbed23	1
599bfe65-cb7c-4281-940d-fe715ee0bdae	evento-f73017bf-5345-4bb1-8fec-9f8cd6696309	zona-norte	entrada-cb2fd6b4-0607-4943-b6c4-d4360efca786	3
c1dcd58e-b09b-4219-bbd4-013176ed7ffc	evento-fac31b09-fad9-407b-a076-636116571d83	zona-norte	entrada-f324eaef-4fd7-488d-a1c7-b8ce10b36e68	1
6c660b2b-a803-437e-b132-19fbba1d3930	evento-8534c392-f6ac-4ad9-8458-da7ae25ff524	zona-norte	entrada-f4050cb6-d351-476c-aeb3-274ec3fcc481	1
c39588f8-ff0b-4813-a655-66f8bd1ad4d5	evento-5cc50bbd-7e22-45be-99a9-b3da74d0e464	zona-norte	rol-z	1
3fc60b67-60bc-4aa5-86db-c1e5465e3caf	evento-0eab32e6-0031-4eba-9e95-e564940a2767	zona-norte	entrada-c81ec061-ab55-4079-b3a9-950bfd6d0529	1
c4537875-fae2-4f76-ba64-079419b0a427	evento-07099df3-e56b-460a-bf3b-89bc83590158	zona-norte	rol-y-db387090-3f1d-4bdb-ba10-a72aa7393c8c	1
9cbee192-e9a8-4d67-b58a-b2c5445fbcc1	evento-f7d845c2-eb19-4c11-b1a8-6f489e5e0cb3	zona-norte	entrada-938c271a-f585-4b99-a1c7-e15ec6c58245	1
b5ff4c98-bfeb-46d9-b68d-03c017399dd6	evento-f7d845c2-eb19-4c11-b1a8-6f489e5e0cb3	zona-norte	entrada-938c271a-f585-4b99-a1c7-e15ec6c58245	1
e24bf64a-55de-4e3f-a2d2-e011c4f08537	evento-b18cf7cc-f1a9-4a0b-bc63-26c2b7e6ae7b	zona-norte	entrada-1fca096a-6182-4fd9-88c2-de399016e812	3
f27a27d5-485a-467f-8076-f71b5efd1956	evento-72664a59-f30c-441f-92fc-d379d09469af	zona-norte	entrada-32a4d7d3-8ee7-4d57-82ec-d77c9e0095da	1
7e4d6b91-8bec-42a8-a753-36ad0fb88b45	evento-ba8fa359-0ed9-4b90-813a-670154a4f820	zona-norte	entrada-16aab400-7f7e-4b91-8f4a-73136ed2c83c	3
26b74f72-4413-46b7-ab15-35b03367ebd3	evento-10658046-d1d2-4c3c-ba5b-bf3dc606ca37	zona-norte	entrada-1223379d-95c5-49ca-818c-b0497c04c9d1	3
89dfcd0d-3ba8-44f5-b65a-e763a423c43e	evento-5c0c9609-8121-43d9-b131-e88795d30d7e	zona-norte	entrada-aefadc7e-8d6f-4dd3-aefe-91b090888d5e	1
649f9068-667c-49cb-9695-82b40a6909ec	evento-38ddd339-935f-4c32-8b5a-a2e3ef988636	zona-norte	rol-z	1
144f270a-f812-4a3d-bc16-8bb0c8cc9899	evento-bf99e5cc-2d81-40b9-b082-083b96c1fb27	zona-norte	entrada-ce49ec43-c8d3-4129-ba72-b7c9abb407e9	1
42e4c837-905c-444c-8157-2b68fab27a4c	evento-4ed72ce2-3eb5-49b4-b0dc-fd383a7353ac	zona-norte	rol-y-8a41f2d7-b0b5-4781-b2a9-82037d3cffa3	1
11a3b20d-af2a-469d-a18f-03ef1e6e6487	evento-19503083-ce78-4837-9433-8683f68d3845	zona-norte	entrada-494a9c66-af9c-4407-b151-954682e8242b	1
58bc50e6-e123-464b-9c19-b04c473648a2	evento-19503083-ce78-4837-9433-8683f68d3845	zona-norte	entrada-494a9c66-af9c-4407-b151-954682e8242b	1
1db03fe8-e947-4bf5-9ed0-4e4e00e0493d	evento-2a63af80-f2f2-40c2-8063-c9318fe816ad	zona-norte	entrada-1a3d1a4f-c660-4b54-9582-f905ad10b969	3
8f216650-97b1-4f7a-bf55-d47808eac978	evento-a7ec8baa-d771-4e11-b726-1299e2b78fc3	zona-norte	entrada-1e23b740-df80-43d6-a897-67caef3875bd	1
4ee0390b-7d49-4144-82b5-336b4f648401	evento-ff6a64b1-2715-49da-8050-0f369f2d92e1	zona-norte	entrada-190a53fd-63dc-44ed-9a3b-654a5110e05a	3
f9308b2c-71f2-4401-a975-6f5cdb1baaae	evento-8cb5c17d-aa8b-464c-b9d1-c5c83ca42fa0	zona-norte	entrada-3368082f-03f6-453f-8f6d-2959fb9ef211	3
d611a10e-3e4d-4171-8554-efdefe130c96	evento-1a3614f8-2fe2-4cee-b367-89857de58346	zona-norte	entrada-3415958b-4166-449e-afaa-795516932171	1
cd5faf6c-a43f-44ff-b4c0-0304de6a6db7	evento-c0db1270-efe1-4e91-9494-d06889209900	zona-norte	rol-z	1
ced76985-9efd-4de8-a4fd-21efc9896a12	evento-a844cf61-f74c-4c3d-b0c1-7ea0bcbaa18a	zona-norte	entrada-1a1bcb05-19ad-46ea-93f1-3f856f57dce7	1
acd153f7-9800-4425-8883-3a56e4efe8db	evento-fa331c50-aa6d-42c4-8282-f4b725eecf68	zona-norte	rol-y-f6f62044-be17-436b-b352-27a270333fb1	1
d17abb75-36b7-416f-8ae3-f6dc9189ebca	evento-a719c7aa-ca65-40dc-a708-bc8498fdd8c7	zona-norte	entrada-97f039df-8c75-4a5b-99cb-e35dd2c4eb81	1
454a43e3-cfc6-4383-a1e9-41dbfe62fda3	evento-a719c7aa-ca65-40dc-a708-bc8498fdd8c7	zona-norte	entrada-97f039df-8c75-4a5b-99cb-e35dd2c4eb81	1
ddf8210a-6710-48a5-a765-33ffe5ecaecb	evento-b0e8baa4-36c2-48f1-afbe-49563208af5a	zona-norte	entrada-0ff37946-74e1-435c-b84e-5f6e6d7192f4	3
46142ade-3edc-4ccd-9900-bf3fb6fc5b95	evento-7243cb05-9471-41bd-b07a-ca8d97f87784	zona-norte	entrada-f7614c39-90b8-40bb-b69a-a2c5b0e86287	1
1d2f0e79-d891-4906-a29c-96c5853b5d86	evento-f10d745d-6252-47f9-b069-2b0e218d32ee	zona-norte	entrada-2a6061fe-fb86-4a25-9fa8-11138da9a9c1	3
c27e1483-ffc2-4276-a3d6-3c2bbbd8d473	evento-b5808757-f22b-474a-b998-db1b81036ef6	zona-norte	entrada-10f3f131-e468-4cf4-9853-bcb4ee1d9cde	3
df8befa2-5e42-45ae-9335-ebdb989878b4	evento-f8612086-1840-4928-a574-718bc40137ac	zona-norte	entrada-d7039190-e8c4-4657-a41d-7ce189ceb171	1
9381f21a-13ca-4552-9e67-8c4efc4e5139	evento-0a8df41f-8f8a-4382-8c38-401c7a2b366c	zona-norte	rol-z	1
f1ec6fe4-9caa-45d1-9d92-bfc971f12adf	evento-348fa45e-221f-41eb-87f2-3f02f1275f16	zona-norte	entrada-20379ee5-1bde-44ab-94aa-0c0944a45e5f	1
079fb5aa-64a4-4cdf-8b5a-33c8ef4354df	evento-a1a3313f-ea9b-4788-9594-0f448cbe69ce	zona-norte	rol-y-1a83d748-af93-4367-94ee-addab740be74	1
4a513c7a-1abb-457e-9407-3d372885c33b	evento-cd34bf7a-e2a3-44e1-9948-010228cce0cb	zona-norte	entrada-3356656d-b51c-49f8-99d2-f6ce73eec0e4	1
38f1c2a3-7ac9-4024-8283-7991c698579d	evento-cd34bf7a-e2a3-44e1-9948-010228cce0cb	zona-norte	entrada-3356656d-b51c-49f8-99d2-f6ce73eec0e4	1
d63bd75e-0f2a-4909-a05d-093ab9a2dde8	evento-98e4e2f9-2568-46a7-aea4-031627260026	zona-norte	entrada-362dc07b-6174-479e-86d4-9c8d90c817ba	3
630635a3-df41-4a30-bf68-af5ec7cd7a37	evento-b5265e46-053a-4c5a-abba-fe36a853b2c5	zona-norte	entrada-68183781-ae5a-4017-8e2f-c34b5136bd8c	1
c52d3423-5923-4610-abf2-b9bc29f0eab9	evento-dcc3d002-5c69-4279-ba8f-fd2bf184f474	zona-norte	entrada-64ca134d-7077-4f62-99c1-9eae5451be90	3
2b2443ac-209e-4d10-946f-7ed888983be0	evento-1ca8ddca-811a-4a4e-980c-c19b7ddab24a	zona-norte	entrada-857dd131-f1ba-44a2-9ee1-7e94cae8c54d	3
ff1520ac-7da1-4ba6-bba2-e4370c463c14	evento-a3a99fc3-dd64-430c-8bcb-4b28c831ad85	zona-norte	entrada-07a744b9-2a8f-4cde-a953-b7d09d7dd145	1
4b587f53-9876-41bc-9b29-699cdb977110	evento-cecec9fe-b533-4473-88e9-ac03546c36a3	zona-norte	rol-z	1
9e112681-95c4-4a72-a700-9026b60b8f6b	evento-2482196b-5b0a-48ce-a413-b7a8bd9fa82d	zona-norte	entrada-b16b210b-566a-419d-b799-615b7c5f4314	1
4f90c45d-7703-4ae6-be73-b761d97e7e73	evento-a33d5b35-3e42-4fe5-8bc9-706877d84973	zona-norte	rol-y-3bf8211a-066a-493e-beda-cb69efb7d890	1
63a1a0e4-880a-49dd-84bc-49dab6440a85	evento-f60f83a1-53fa-47c5-a1fa-9a40e057aabe	zona-norte	entrada-d3000061-4600-41d0-ac7a-1eb4c90cbfc5	1
81de77d4-116f-4de8-a9d6-7d1e769fe879	evento-f60f83a1-53fa-47c5-a1fa-9a40e057aabe	zona-norte	entrada-d3000061-4600-41d0-ac7a-1eb4c90cbfc5	1
d3f1ea20-7b37-41b1-b56a-d1643c5ca2a0	evento-0ae6581d-8af7-4f53-b089-710bec055d94	zona-norte	entrada-e79afe48-f987-40c3-9bda-b031da1ded35	3
af63f370-df6e-4beb-86a5-b6a2b03518c2	evento-875ffc80-213f-4f5f-aaf7-6e62bc5a6b44	zona-norte	entrada-efbf8d08-08bf-42fc-a45c-8cce058bb07e	1
b681a795-8da4-4af4-b7f4-ae1de7139d57	evento-72b4d6df-7382-48e4-b59e-620ed0228f56	zona-norte	entrada-ad4aed6d-474c-43f5-8562-df3c38a5c661	3
2eb235fb-5fc6-4241-8d40-7cdf40209b54	evento-30489f9e-2f1a-4ca6-a9ca-0fb4f08c62b3	zona-norte	entrada-c27d2f28-b0f5-45bd-bc7a-fe0b0b163410	3
8565cff4-5c3c-4942-a000-9d3a9d5ae18d	evento-12b07a97-6a48-4703-b51c-31005756e9d7	zona-norte	entrada-f2f5fd4c-21f0-452c-bd5b-85c341fc4ac7	1
7ffea324-b1c4-4671-91db-7af90184e3e8	evento-62c8a018-4aa7-45ae-9e64-28cdf5a62ce6	zona-norte	rol-z	1
4a9a9616-cd85-4d49-95c6-bb37d26a5127	evento-7ae2148c-2db7-4573-a262-50f5f63c9363	zona-norte	entrada-9cdc5412-b7a1-4778-915c-17ee5fa7b4dd	1
bf152eb0-81be-4ce3-a88b-e273be5fe911	evento-8267da69-42b1-44f9-b05b-f6b32fe1bda6	zona-norte	rol-y-efd13fe2-b0cb-4daf-84f0-d9a9b68380ea	1
d109678b-85da-43f6-8231-08ac08e6d1dd	evento-967d18a0-a2f3-4db8-acbc-b7d7da3b18db	zona-norte	entrada-6603965f-77fc-4dcc-bc55-13af44e53e3f	1
63338975-096a-4e25-b04b-f022609e75b3	evento-967d18a0-a2f3-4db8-acbc-b7d7da3b18db	zona-norte	entrada-6603965f-77fc-4dcc-bc55-13af44e53e3f	1
e7a24057-90d7-4e5b-b07e-bb39f35b0f44	evento-de59367a-09e5-409c-9bc4-76a5a5347f07	zona-norte	entrada-08c2a559-37a2-4ca6-8ecd-b1717c1d4c04	3
be125e3f-75ad-427a-a9ab-4e6f8b158185	evento-3fedccad-3b29-4825-868b-42135f8dbf15	zona-norte	entrada-c8603ab5-3440-4a45-8ecb-f888a4d2b358	1
9ccbcd1b-78a1-450a-b75d-fae4d3d12ba1	evento-b43fc3fb-2064-48a7-b7bc-d07ebfea40e6	zona-norte	entrada-1b20ae85-3931-440a-b138-74fed18312eb	3
c6380d67-1ae3-4e68-8476-e9a0b476e49d	evento-67844fa0-fc0a-4c7e-b5e1-bfc506362186	zona-norte	entrada-3b46c9b4-24f3-4f25-b251-b770d650ab02	3
e4b34a06-7450-427c-a855-ea42ce9d316d	evento-119e0810-788a-4b7a-8bd2-279423b788c5	zona-norte	entrada-3fe72270-1381-486b-96ff-d01ef24360ab	1
cef37374-38d9-4ed6-b9e0-4da48907d150	evento-cc811a0d-332e-4c69-86ca-c9975b578a5d	zona-norte	rol-z	1
ba303174-443a-49cf-914a-e23c67f03178	evento-78784bd3-8fab-4bc4-84a4-f8f1b7686c26	zona-norte	entrada-24c5f476-8437-484f-b5e8-611aaa5ba7ba	1
8f7f2242-adef-48cc-9803-609a845c55aa	evento-5c89de11-1a35-40ab-bb9d-d8961e32cf22	zona-norte	rol-y-7d39c009-2571-4651-ac65-a533f1ab5f5f	1
23ad9aae-5534-4fea-9bfe-25127376db34	evento-11617c36-5209-4135-85fb-597174f65565	zona-norte	entrada-19e9a31d-4b69-4c25-88ae-94a2c3df8354	1
a9811770-f782-4e44-bb54-4ec606e50e7d	evento-11617c36-5209-4135-85fb-597174f65565	zona-norte	entrada-19e9a31d-4b69-4c25-88ae-94a2c3df8354	1
e4b5238e-ca87-477d-b598-9fe4934fe76a	evento-0d7416e1-48ef-4397-83f9-17dbc1854bb2	zona-norte	entrada-ffd5a86f-6f22-4a5d-bfc1-529572035460	3
8376cad1-2fde-40b2-95ec-528616c370ff	evento-00457e32-5dfc-4639-910d-78303fc214c1	zona-norte	entrada-0d8158c2-81e7-4054-8996-243ce201a91f	1
575d3394-7a91-4938-9e81-8efbf4bf7c73	evento-616125e0-52c3-4b25-a995-186158819f50	zona-norte	entrada-30b4de50-aac8-4a01-a178-9cb9afb1ff1c	3
5021e557-fe74-4487-8ae5-9c5aa91d2fdc	evento-a02dcee1-e3bf-4cec-9850-f179833d1eb7	zona-norte	entrada-64af5637-200b-4ec4-ae08-90a0c6f64298	3
c904f949-7fa6-45cf-b887-cfe739992af6	evento-ab0335f9-1824-4fac-bea9-4f6222b3e24a	zona-norte	entrada-a8fd0cb2-1008-4f64-bd9e-dfdc00b166c4	1
b04accf2-eae0-4e05-a206-28c971da39aa	evento-e1f23bcf-2c22-498c-945b-7148afdda25c	zona-norte	rol-z	1
\.


--
-- Name: migraciones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.migraciones_id_seq', 2, true);


--
-- Name: registros_asistencia PK_36b13209a79c9e8898f70bcd5e6; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registros_asistencia
    ADD CONSTRAINT "PK_36b13209a79c9e8898f70bcd5e6" PRIMARY KEY (id);


--
-- Name: solicitudes_cambio_turno PK_5c40f0257b0ef8e3eb9674c0d99; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_cambio_turno
    ADD CONSTRAINT "PK_5c40f0257b0ef8e3eb9674c0d99" PRIMARY KEY (id);


--
-- Name: turnos PK_61dbaea0fc136ee2ef981f14782; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turnos
    ADD CONSTRAINT "PK_61dbaea0fc136ee2ef981f14782" PRIMARY KEY (id);


--
-- Name: empleados PK_73a63a6fcb4266219be3eb0ce8a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT "PK_73a63a6fcb4266219be3eb0ce8a" PRIMARY KEY (id);


--
-- Name: notificaciones PK_a9d32a419ff58b53a38b5ef85d4; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT "PK_a9d32a419ff58b53a38b5ef85d4" PRIMARY KEY (id);


--
-- Name: migraciones PK_c790b3af92e49234538c56f4abb; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migraciones
    ADD CONSTRAINT "PK_c790b3af92e49234538c56f4abb" PRIMARY KEY (id);


--
-- Name: zonas_evento PK_zonas_evento_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zonas_evento
    ADD CONSTRAINT "PK_zonas_evento_id" PRIMARY KEY (id);


--
-- Name: empleados UQ_149783bdb3291033ccd3ef9ee39; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT "UQ_149783bdb3291033ccd3ef9ee39" UNIQUE ("usuarioId");


--
-- Name: registros_asistencia UQ_859a5354105c601691073964a20; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registros_asistencia
    ADD CONSTRAINT "UQ_859a5354105c601691073964a20" UNIQUE ("idempotencyKey");


--
-- Name: empleados UQ_d895bb4248c3f09e87f99f4a4f9; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT "UQ_d895bb4248c3f09e87f99f4a4f9" UNIQUE (credencial);


--
-- Name: turnos FK_24a00e0a11e8b29c0e4cde602f9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turnos
    ADD CONSTRAINT "FK_24a00e0a11e8b29c0e4cde602f9" FOREIGN KEY ("empleadoId") REFERENCES public.empleados(id);


--
-- Name: registros_asistencia FK_6ad00b1b983aca3e96d1f6a363d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registros_asistencia
    ADD CONSTRAINT "FK_6ad00b1b983aca3e96d1f6a363d" FOREIGN KEY ("empleadoId") REFERENCES public.empleados(id);


--
-- Name: solicitudes_cambio_turno FK_90265cb7c155bcd529c4d0593e4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_cambio_turno
    ADD CONSTRAINT "FK_90265cb7c155bcd529c4d0593e4" FOREIGN KEY ("empleadoReemplazoId") REFERENCES public.empleados(id);


--
-- Name: solicitudes_cambio_turno FK_c60738ca5893cf2f2319ac0ddfc; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_cambio_turno
    ADD CONSTRAINT "FK_c60738ca5893cf2f2319ac0ddfc" FOREIGN KEY ("turnoId") REFERENCES public.turnos(id);


--
-- Name: registros_asistencia FK_e97bdf07f2a4cd7f656fd38f1fb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registros_asistencia
    ADD CONSTRAINT "FK_e97bdf07f2a4cd7f656fd38f1fb" FOREIGN KEY ("turnoId") REFERENCES public.turnos(id);


--
-- Name: turnos FK_turnos_zonaEventoId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turnos
    ADD CONSTRAINT "FK_turnos_zonaEventoId" FOREIGN KEY ("zonaEventoId") REFERENCES public.zonas_evento(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict Driu2e7qLyge3J6ziHfJtGBEZPDdN8pygZix0VBoaRaayGhsFjkkEG5IpSStLSw

