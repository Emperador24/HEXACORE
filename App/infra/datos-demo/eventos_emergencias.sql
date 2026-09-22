--
-- PostgreSQL database dump
--

\restrict tLxKFq1UNf9kePRM4t843kOYKMIBSnW1UlHJAL5sYfd6JsRxPyoNN1DLZV6ZcF5

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
d3f1fe6a-8673-4018-bb5f-8e69d7be8297	a0000011-0000-4000-8000-000000000011	Sofía Vargas	Entrada	reemplazo@hexacore.com	t	5.833333333333333e-06
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
01ca1341-bea3-4db0-adfa-d144e188ed16	f57a7cd8-ee97-43bf-8f30-59945c60eba2	\N	ENTRADA	personal@hexacore.com	t	El empleado no tiene un turno vigente asignado para este evento.	\N	2026-09-21 17:19:49.606+00	\N	2026-09-21 17:19:49.609+00
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

\unrestrict tLxKFq1UNf9kePRM4t843kOYKMIBSnW1UlHJAL5sYfd6JsRxPyoNN1DLZV6ZcF5

