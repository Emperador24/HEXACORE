--
-- PostgreSQL database dump
--

\restrict 5klb1Of7NnUZIOkoGK3bOlSyPS8T1AMLu03salfAP898Hl8mFVhWnyhXVXo03Sh

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

ALTER TABLE IF EXISTS ONLY public.usos_promocion DROP CONSTRAINT IF EXISTS fk_usos_compra;
ALTER TABLE IF EXISTS ONLY public.usos_promocion DROP CONSTRAINT IF EXISTS fk_usos_codigo;
ALTER TABLE IF EXISTS ONLY public.transacciones_reventa DROP CONSTRAINT IF EXISTS fk_transacciones_publicacion;
ALTER TABLE IF EXISTS ONLY public.transacciones_reventa DROP CONSTRAINT IF EXISTS fk_transacciones_entrada;
ALTER TABLE IF EXISTS ONLY public.publicaciones_reventa DROP CONSTRAINT IF EXISTS fk_publicaciones_entrada;
ALTER TABLE IF EXISTS ONLY public.ingresos DROP CONSTRAINT IF EXISTS fk_ingresos_entrada;
ALTER TABLE IF EXISTS ONLY public.historial_propietarios DROP CONSTRAINT IF EXISTS fk_historial_entrada;
ALTER TABLE IF EXISTS ONLY public.entradas DROP CONSTRAINT IF EXISTS fk_entradas_compra;
ALTER TABLE IF EXISTS ONLY public.cancelaciones DROP CONSTRAINT IF EXISTS fk_cancelaciones_compra;
DROP TRIGGER IF EXISTS trg_historial_propietarios_inmutable ON public.historial_propietarios;
DROP INDEX IF EXISTS public.uq_uso_vivo_por_compra;
DROP INDEX IF EXISTS public.uq_publicacion_activa_por_entrada;
DROP INDEX IF EXISTS public.idx_usos_promocion_codigo;
DROP INDEX IF EXISTS public.idx_transacciones_publicacion;
DROP INDEX IF EXISTS public.idx_transacciones_estado;
DROP INDEX IF EXISTS public.idx_transacciones_comprador;
DROP INDEX IF EXISTS public.idx_publicaciones_vendedor;
DROP INDEX IF EXISTS public.idx_publicaciones_mercado;
DROP INDEX IF EXISTS public.idx_publicaciones_estado;
DROP INDEX IF EXISTS public.idx_localidades_evento;
DROP INDEX IF EXISTS public.idx_ingresos_evento;
DROP INDEX IF EXISTS public.idx_historial_entrada;
DROP INDEX IF EXISTS public.idx_eventos_ciudad;
DROP INDEX IF EXISTS public.idx_eventos_categoria;
DROP INDEX IF EXISTS public.idx_eventos_cartelera;
DROP INDEX IF EXISTS public.idx_entradas_propietario;
DROP INDEX IF EXISTS public.idx_entradas_evento;
DROP INDEX IF EXISTS public.idx_entradas_compra;
DROP INDEX IF EXISTS public.idx_compras_reservas_vivas;
DROP INDEX IF EXISTS public.idx_compras_comprador;
DROP INDEX IF EXISTS public.idx_cancelaciones_compra;
ALTER TABLE IF EXISTS ONLY public.usos_promocion DROP CONSTRAINT IF EXISTS usos_promocion_pkey;
ALTER TABLE IF EXISTS ONLY public.transacciones_reventa DROP CONSTRAINT IF EXISTS uq_transacciones_numero;
ALTER TABLE IF EXISTS ONLY public.localidades_evento DROP CONSTRAINT IF EXISTS uq_localidades_nombre_por_evento;
ALTER TABLE IF EXISTS ONLY public.ingresos DROP CONSTRAINT IF EXISTS uq_ingresos_entrada;
ALTER TABLE IF EXISTS ONLY public.entradas DROP CONSTRAINT IF EXISTS uq_entradas_numero_ticket;
ALTER TABLE IF EXISTS ONLY public.entradas DROP CONSTRAINT IF EXISTS uq_entradas_codigo_qr;
ALTER TABLE IF EXISTS ONLY public.compras DROP CONSTRAINT IF EXISTS uq_compras_numero;
ALTER TABLE IF EXISTS ONLY public.transacciones_reventa DROP CONSTRAINT IF EXISTS transacciones_reventa_pkey;
ALTER TABLE IF EXISTS ONLY public.publicaciones_reventa DROP CONSTRAINT IF EXISTS publicaciones_reventa_pkey;
ALTER TABLE IF EXISTS ONLY public.localidades_evento DROP CONSTRAINT IF EXISTS localidades_evento_pkey;
ALTER TABLE IF EXISTS ONLY public.ingresos DROP CONSTRAINT IF EXISTS ingresos_pkey;
ALTER TABLE IF EXISTS ONLY public.historial_propietarios DROP CONSTRAINT IF EXISTS historial_propietarios_pkey;
ALTER TABLE IF EXISTS ONLY public.eventos_referencia DROP CONSTRAINT IF EXISTS eventos_referencia_pkey;
ALTER TABLE IF EXISTS ONLY public.entradas DROP CONSTRAINT IF EXISTS entradas_pkey;
ALTER TABLE IF EXISTS ONLY public.compras DROP CONSTRAINT IF EXISTS compras_pkey;
ALTER TABLE IF EXISTS ONLY public.codigos_promocionales DROP CONSTRAINT IF EXISTS codigos_promocionales_pkey;
ALTER TABLE IF EXISTS ONLY public.cancelaciones DROP CONSTRAINT IF EXISTS cancelaciones_pkey;
ALTER TABLE IF EXISTS ONLY public.migraciones DROP CONSTRAINT IF EXISTS "PK_c790b3af92e49234538c56f4abb";
ALTER TABLE IF EXISTS public.usos_promocion ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.migraciones ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.historial_propietarios ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.usos_promocion_id_seq;
DROP TABLE IF EXISTS public.usos_promocion;
DROP TABLE IF EXISTS public.transacciones_reventa;
DROP TABLE IF EXISTS public.publicaciones_reventa;
DROP SEQUENCE IF EXISTS public.numero_transaccion_seq;
DROP SEQUENCE IF EXISTS public.numero_ticket_seq;
DROP SEQUENCE IF EXISTS public.numero_compra_seq;
DROP SEQUENCE IF EXISTS public.migraciones_id_seq;
DROP TABLE IF EXISTS public.migraciones;
DROP TABLE IF EXISTS public.localidades_evento;
DROP TABLE IF EXISTS public.ingresos;
DROP SEQUENCE IF EXISTS public.historial_propietarios_id_seq;
DROP TABLE IF EXISTS public.historial_propietarios;
DROP TABLE IF EXISTS public.eventos_referencia;
DROP TABLE IF EXISTS public.entradas;
DROP TABLE IF EXISTS public.compras;
DROP TABLE IF EXISTS public.codigos_promocionales;
DROP TABLE IF EXISTS public.cancelaciones;
DROP FUNCTION IF EXISTS public.historial_propietarios_solo_insercion();
DROP TYPE IF EXISTS public.uso_promocion_estado;
DROP TYPE IF EXISTS public.transaccion_estado;
DROP TYPE IF EXISTS public.publicacion_estado;
DROP TYPE IF EXISTS public.motivo_cambio_propietario;
DROP TYPE IF EXISTS public.ingreso_origen;
DROP TYPE IF EXISTS public.evento_estado;
DROP TYPE IF EXISTS public.entrada_estado;
DROP TYPE IF EXISTS public.compra_estado;
DROP TYPE IF EXISTS public.cancelacion_estado;
DROP EXTENSION IF EXISTS "uuid-ossp";
--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: cancelacion_estado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cancelacion_estado AS ENUM (
    'PENDIENTE',
    'APROBADA',
    'RECHAZADA',
    'FALLIDA'
);


--
-- Name: compra_estado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.compra_estado AS ENUM (
    'PENDIENTE',
    'PAGANDO',
    'PAGADA',
    'EXPIRADA',
    'CANCELADA',
    'PARCIALMENTE_CANCELADA'
);


--
-- Name: entrada_estado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.entrada_estado AS ENUM (
    'VALIDA',
    'EN_REVENTA',
    'USADA',
    'ANULADA'
);


--
-- Name: evento_estado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.evento_estado AS ENUM (
    'BORRADOR',
    'PUBLICADO',
    'CANCELADO'
);


--
-- Name: ingreso_origen; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ingreso_origen AS ENUM (
    'EN_LINEA',
    'SINCRONIZADO'
);


--
-- Name: motivo_cambio_propietario; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.motivo_cambio_propietario AS ENUM (
    'EMISION',
    'REVENTA'
);


--
-- Name: publicacion_estado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.publicacion_estado AS ENUM (
    'ACTIVA',
    'VENDIDA',
    'RETIRADA',
    'EXPIRADA'
);


--
-- Name: transaccion_estado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transaccion_estado AS ENUM (
    'PENDIENTE',
    'APROBADA',
    'RECHAZADA',
    'FALLIDA',
    'CANCELADA'
);


--
-- Name: uso_promocion_estado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.uso_promocion_estado AS ENUM (
    'RESERVADO',
    'CONFIRMADO',
    'LIBERADO'
);


--
-- Name: historial_propietarios_solo_insercion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.historial_propietarios_solo_insercion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        RAISE EXCEPTION
          'historial_propietarios es de solo inserción (auditoría CU-006 / RNF-11): % rechazado',
          TG_OP;
      END;
      $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: cancelaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cancelaciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    compra_id uuid NOT NULL,
    solicitante_id uuid NOT NULL,
    entradas_ids uuid[] NOT NULL,
    porcentaje_reembolso integer NOT NULL,
    monto_reembolso numeric(12,2) NOT NULL,
    motivo character varying(500) NOT NULL,
    estado public.cancelacion_estado NOT NULL,
    referencia_pasarela character varying(128),
    motivo_pasarela text,
    creada_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizada_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_cancelaciones_aprobada_con_referencia CHECK (((estado <> 'APROBADA'::public.cancelacion_estado) OR (referencia_pasarela IS NOT NULL))),
    CONSTRAINT ck_cancelaciones_con_entradas CHECK ((cardinality(entradas_ids) > 0)),
    CONSTRAINT ck_cancelaciones_monto_positivo CHECK ((monto_reembolso > (0)::numeric)),
    CONSTRAINT ck_cancelaciones_porcentaje CHECK (((porcentaje_reembolso >= 1) AND (porcentaje_reembolso <= 100)))
);


--
-- Name: codigos_promocionales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.codigos_promocionales (
    codigo character varying(40) NOT NULL,
    descripcion character varying(200) NOT NULL,
    porcentaje integer NOT NULL,
    evento_id uuid,
    localidad_id uuid,
    vigente_desde timestamp with time zone NOT NULL,
    vigente_hasta timestamp with time zone NOT NULL,
    limite_usos integer,
    usos integer DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_promociones_codigo_mayusculas CHECK (((codigo)::text = upper((codigo)::text))),
    CONSTRAINT ck_promociones_limite_positivo CHECK (((limite_usos IS NULL) OR (limite_usos > 0))),
    CONSTRAINT ck_promociones_porcentaje CHECK (((porcentaje >= 1) AND (porcentaje <= 90))),
    CONSTRAINT ck_promociones_usos_en_rango CHECK (((usos >= 0) AND ((limite_usos IS NULL) OR (usos <= limite_usos)))),
    CONSTRAINT ck_promociones_vigencia CHECK ((vigente_hasta > vigente_desde))
);


--
-- Name: compras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    numero_compra character varying(32) NOT NULL,
    comprador_id uuid NOT NULL,
    evento_id uuid NOT NULL,
    localidad_id uuid NOT NULL,
    cantidad integer NOT NULL,
    precio_unitario numeric(12,2) NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    descuento numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) NOT NULL,
    codigo_promocional character varying(40),
    estado public.compra_estado DEFAULT 'PENDIENTE'::public.compra_estado NOT NULL,
    intentos_rechazados integer DEFAULT 0 NOT NULL,
    referencia_pasarela character varying(128),
    motivo text,
    expira_en timestamp with time zone NOT NULL,
    pagada_en timestamp with time zone,
    creada_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizada_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_compras_cantidad CHECK (((cantidad >= 1) AND (cantidad <= 10))),
    CONSTRAINT ck_compras_descuento_en_rango CHECK (((descuento >= (0)::numeric) AND (descuento < subtotal))),
    CONSTRAINT ck_compras_pagada_con_referencia CHECK (((estado <> ALL (ARRAY['PAGADA'::public.compra_estado, 'CANCELADA'::public.compra_estado, 'PARCIALMENTE_CANCELADA'::public.compra_estado])) OR (referencia_pasarela IS NOT NULL))),
    CONSTRAINT ck_compras_subtotal_cuadra CHECK ((subtotal = (precio_unitario * (cantidad)::numeric))),
    CONSTRAINT ck_compras_total_cuadra CHECK ((total = (subtotal - descuento)))
);


--
-- Name: entradas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entradas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    evento_id uuid NOT NULL,
    localidad_id uuid NOT NULL,
    localidad_nombre character varying(120) NOT NULL,
    propietario_id uuid NOT NULL,
    codigo_qr character varying(64) NOT NULL,
    estado public.entrada_estado DEFAULT 'VALIDA'::public.entrada_estado NOT NULL,
    precio_original numeric(12,2) NOT NULL,
    numero_ticket character varying(32) NOT NULL,
    creada_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizada_en timestamp with time zone DEFAULT now() NOT NULL,
    compra_id uuid,
    CONSTRAINT ck_entradas_precio_positivo CHECK ((precio_original > (0)::numeric))
);


--
-- Name: eventos_referencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eventos_referencia (
    evento_id uuid NOT NULL,
    nombre character varying(200) NOT NULL,
    fecha_inicio timestamp with time zone NOT NULL,
    lugar character varying(200) NOT NULL,
    ciudad character varying(120) NOT NULL,
    permite_reventa boolean DEFAULT true NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    estado public.evento_estado NOT NULL,
    categoria character varying(60) NOT NULL,
    artista character varying(200),
    descripcion text,
    fecha_fin timestamp with time zone,
    imagen_url character varying(500),
    aforo_maximo integer,
    asistentes integer DEFAULT 0 NOT NULL,
    CONSTRAINT ck_eventos_aforo_positivo CHECK (((aforo_maximo IS NULL) OR (aforo_maximo > 0))),
    CONSTRAINT ck_eventos_asistentes_en_rango CHECK (((asistentes >= 0) AND ((aforo_maximo IS NULL) OR (asistentes <= aforo_maximo)))),
    CONSTRAINT ck_eventos_fin_despues_de_inicio CHECK (((fecha_fin IS NULL) OR (fecha_fin > fecha_inicio)))
);


--
-- Name: historial_propietarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historial_propietarios (
    id bigint NOT NULL,
    entrada_id uuid NOT NULL,
    propietario_anterior_id uuid,
    propietario_nuevo_id uuid NOT NULL,
    motivo public.motivo_cambio_propietario NOT NULL,
    transaccion_id uuid,
    codigo_qr_anterior character varying(64),
    codigo_qr_nuevo character varying(64) NOT NULL,
    registrado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_historial_coherente_con_motivo CHECK ((((motivo = 'EMISION'::public.motivo_cambio_propietario) AND (propietario_anterior_id IS NULL) AND (transaccion_id IS NULL)) OR ((motivo = 'REVENTA'::public.motivo_cambio_propietario) AND (propietario_anterior_id IS NOT NULL) AND (transaccion_id IS NOT NULL)))),
    CONSTRAINT ck_historial_propietario_cambia CHECK (((propietario_anterior_id IS NULL) OR (propietario_anterior_id <> propietario_nuevo_id)))
);


--
-- Name: historial_propietarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.historial_propietarios_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: historial_propietarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.historial_propietarios_id_seq OWNED BY public.historial_propietarios.id;


--
-- Name: ingresos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingresos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entrada_id uuid NOT NULL,
    evento_id uuid NOT NULL,
    validado_por uuid NOT NULL,
    punto_acceso character varying(60),
    origen public.ingreso_origen NOT NULL,
    escaneado_en timestamp with time zone NOT NULL,
    registrado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: localidades_evento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.localidades_evento (
    localidad_id uuid NOT NULL,
    evento_id uuid NOT NULL,
    nombre character varying(120) NOT NULL,
    precio numeric(12,2) NOT NULL,
    aforo integer NOT NULL,
    vendidas integer DEFAULT 0 NOT NULL,
    orden smallint DEFAULT 0 NOT NULL,
    actualizada_en timestamp with time zone DEFAULT now() NOT NULL,
    reservadas integer DEFAULT 0 NOT NULL,
    CONSTRAINT ck_localidades_aforo_positivo CHECK ((aforo > 0)),
    CONSTRAINT ck_localidades_cupo_en_rango CHECK (((vendidas >= 0) AND (reservadas >= 0) AND ((vendidas + reservadas) <= aforo))),
    CONSTRAINT ck_localidades_precio_positivo CHECK ((precio > (0)::numeric))
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
-- Name: numero_compra_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.numero_compra_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: numero_ticket_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.numero_ticket_seq
    START WITH 1000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: numero_transaccion_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.numero_transaccion_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: publicaciones_reventa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.publicaciones_reventa (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entrada_id uuid NOT NULL,
    vendedor_id uuid NOT NULL,
    precio numeric(12,2) NOT NULL,
    precio_original numeric(12,2) NOT NULL,
    estado public.publicacion_estado DEFAULT 'ACTIVA'::public.publicacion_estado NOT NULL,
    comprador_id uuid,
    fecha_publicacion timestamp with time zone DEFAULT now() NOT NULL,
    fecha_expiracion timestamp with time zone NOT NULL,
    fecha_cierre timestamp with time zone,
    creada_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizada_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_publicaciones_cierre_coherente CHECK ((((estado = 'ACTIVA'::public.publicacion_estado) AND (fecha_cierre IS NULL)) OR ((estado <> 'ACTIVA'::public.publicacion_estado) AND (fecha_cierre IS NOT NULL)))),
    CONSTRAINT ck_publicaciones_comprador_coherente CHECK ((((estado = 'VENDIDA'::public.publicacion_estado) AND (comprador_id IS NOT NULL)) OR ((estado <> 'VENDIDA'::public.publicacion_estado) AND (comprador_id IS NULL)))),
    CONSTRAINT ck_publicaciones_precio_positivo CHECK ((precio > (0)::numeric))
);


--
-- Name: transacciones_reventa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transacciones_reventa (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    publicacion_id uuid NOT NULL,
    entrada_id uuid NOT NULL,
    comprador_id uuid NOT NULL,
    vendedor_id uuid NOT NULL,
    precio numeric(12,2) NOT NULL,
    comision numeric(12,2) NOT NULL,
    neto_vendedor numeric(12,2) NOT NULL,
    estado public.transaccion_estado DEFAULT 'PENDIENTE'::public.transaccion_estado NOT NULL,
    referencia_pasarela character varying(128),
    motivo text,
    numero_transaccion character varying(32) NOT NULL,
    creada_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizada_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_transacciones_importes_no_negativos CHECK (((precio > (0)::numeric) AND (comision >= (0)::numeric) AND (neto_vendedor >= (0)::numeric))),
    CONSTRAINT ck_transacciones_referencia_si_aprobada CHECK (((estado <> 'APROBADA'::public.transaccion_estado) OR (referencia_pasarela IS NOT NULL))),
    CONSTRAINT ck_transacciones_reparto_cuadra CHECK ((precio = (comision + neto_vendedor)))
);


--
-- Name: usos_promocion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usos_promocion (
    id bigint NOT NULL,
    codigo character varying(40) NOT NULL,
    compra_id uuid NOT NULL,
    usuario_id uuid NOT NULL,
    descuento numeric(12,2) NOT NULL,
    estado public.uso_promocion_estado NOT NULL,
    registrado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_usos_descuento_positivo CHECK ((descuento > (0)::numeric))
);


--
-- Name: usos_promocion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usos_promocion_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usos_promocion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usos_promocion_id_seq OWNED BY public.usos_promocion.id;


--
-- Name: historial_propietarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_propietarios ALTER COLUMN id SET DEFAULT nextval('public.historial_propietarios_id_seq'::regclass);


--
-- Name: migraciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migraciones ALTER COLUMN id SET DEFAULT nextval('public.migraciones_id_seq'::regclass);


--
-- Name: usos_promocion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usos_promocion ALTER COLUMN id SET DEFAULT nextval('public.usos_promocion_id_seq'::regclass);


--
-- Data for Name: cancelaciones; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cancelaciones (id, compra_id, solicitante_id, entradas_ids, porcentaje_reembolso, monto_reembolso, motivo, estado, referencia_pasarela, motivo_pasarela, creada_en, actualizada_en) FROM stdin;
\.


--
-- Data for Name: codigos_promocionales; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.codigos_promocionales (codigo, descripcion, porcentaje, evento_id, localidad_id, vigente_desde, vigente_hasta, limite_usos, usos, activo, creado_en) FROM stdin;
HEXA10	10 % en cualquier evento	10	\N	\N	2026-08-23 04:57:44.981+00	2027-03-21 04:57:44.981+00	100	0	t	2026-09-22 04:57:45.002925+00
ROCK20	20 % en Noche de Rock Nacional	20	e0000002-0000-4000-8000-000000000002	\N	2026-08-23 04:57:44.981+00	2026-11-01 04:57:44.981+00	\N	0	t	2026-09-22 04:57:45.002925+00
VIP15	15 % en Palco VIP del HEXACORE Fest	15	e0000001-0000-4000-8000-000000000001	10000001-0000-4000-8000-000000000002	2026-08-23 04:57:44.981+00	2026-12-11 04:57:44.981+00	50	0	t	2026-09-22 04:57:45.002925+00
ULTIMO	25 % para el primero que lo use	25	\N	\N	2026-08-23 04:57:44.981+00	2026-10-22 04:57:44.981+00	1	1	t	2026-09-22 04:57:45.002925+00
VERANO5	5 % de la temporada pasada	5	\N	\N	2026-03-06 04:57:44.981+00	2026-06-14 04:57:44.981+00	\N	0	t	2026-09-22 04:57:45.002925+00
\.


--
-- Data for Name: compras; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.compras (id, numero_compra, comprador_id, evento_id, localidad_id, cantidad, precio_unitario, subtotal, descuento, total, codigo_promocional, estado, intentos_rechazados, referencia_pasarela, motivo, expira_en, pagada_en, creada_en, actualizada_en) FROM stdin;
\.


--
-- Data for Name: entradas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.entradas (id, evento_id, localidad_id, localidad_nombre, propietario_id, codigo_qr, estado, precio_original, numero_ticket, creada_en, actualizada_en, compra_id) FROM stdin;
20000000-0000-4000-8000-000000000002	e0000001-0000-4000-8000-000000000001	10000001-0000-4000-8000-000000000002	Palco VIP	a0000001-0000-4000-8000-000000000001	HXC-QR-000002	VALIDA	600000.00	TCK-2026-000002	2026-09-22 04:57:45.002925+00	2026-09-22 04:57:45.002925+00	\N
20000000-0000-4000-8000-000000000003	e0000002-0000-4000-8000-000000000002	10000002-0000-4000-8000-000000000001	General	a0000002-0000-4000-8000-000000000002	HXC-QR-000003	VALIDA	120000.00	TCK-2026-000003	2026-09-22 04:57:45.002925+00	2026-09-22 04:57:45.002925+00	\N
20000000-0000-4000-8000-000000000004	e0000002-0000-4000-8000-000000000002	10000002-0000-4000-8000-000000000001	General	a0000003-0000-4000-8000-000000000003	HXC-QR-000004	VALIDA	120000.00	TCK-2026-000004	2026-09-22 04:57:45.002925+00	2026-09-22 04:57:45.002925+00	\N
20000000-0000-4000-8000-000000000005	e0000004-0000-4000-8000-000000000004	10000004-0000-4000-8000-000000000001	General	a0000001-0000-4000-8000-000000000001	HXC-QR-000005	USADA	80000.00	TCK-2026-000005	2026-09-22 04:57:45.002925+00	2026-09-22 04:57:45.002925+00	\N
20000000-0000-4000-8000-000000000006	e0000001-0000-4000-8000-000000000001	10000001-0000-4000-8000-000000000001	General	a0000002-0000-4000-8000-000000000002	HXC-QR-000006	ANULADA	250000.00	TCK-2026-000006	2026-09-22 04:57:45.002925+00	2026-09-22 04:57:45.002925+00	\N
20000000-0000-4000-8000-000000000008	e0000004-0000-4000-8000-000000000004	10000004-0000-4000-8000-000000000001	General	a0000002-0000-4000-8000-000000000002	HXC-QR-000008	VALIDA	80000.00	TCK-2026-000008	2026-09-22 04:57:45.002925+00	2026-09-22 04:57:45.002925+00	\N
20000000-0000-4000-8000-000000000007	e0000003-0000-4000-8000-000000000003	10000003-0000-4000-8000-000000000001	Platea	a0000003-0000-4000-8000-000000000003	HXC-QR-000007	VALIDA	300000.00	TCK-2026-000007	2026-09-22 04:57:45.002925+00	2026-09-22 04:57:45.002925+00	\N
20000000-0000-4000-8000-000000000001	e0000001-0000-4000-8000-000000000001	10000001-0000-4000-8000-000000000001	General	7ddeeb96-41fb-4878-965c-309d443616f4	HXC-QR-4jmVclDFIg-Cbfrf	VALIDA	250000.00	TCK-2026-000001	2026-09-22 04:57:45.002925+00	2026-09-22 04:57:45.124846+00	\N
\.


--
-- Data for Name: eventos_referencia; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.eventos_referencia (evento_id, nombre, fecha_inicio, lugar, ciudad, permite_reventa, actualizado_en, estado, categoria, artista, descripcion, fecha_fin, imagen_url, aforo_maximo, asistentes) FROM stdin;
e0000001-0000-4000-8000-000000000001	HEXACORE Fest 2026	2026-12-21 04:57:44.981+00	Movistar Arena	Bogotá	t	2026-09-22 04:57:45.002925+00	PUBLICADO	Festivales	Aterciopelados	Diez horas de música en vivo con artistas nacionales e internacionales.	2026-12-21 14:57:44.981+00	https://picsum.photos/seed/evt-1/600/800	\N	0
e0000002-0000-4000-8000-000000000002	Noche de Rock Nacional	2026-11-06 04:57:44.981+00	Coliseo El Campín	Bogotá	t	2026-09-22 04:57:45.002925+00	PUBLICADO	Conciertos	Diamante Eléctrico	Lo mejor del rock colombiano en una sola noche.	2026-11-06 09:57:44.981+00	https://picsum.photos/seed/evt-2/600/800	\N	0
e0000003-0000-4000-8000-000000000003	Gala Benéfica Javeriana	2026-10-22 04:57:44.981+00	Teatro Colón	Bogotá	f	2026-09-22 04:57:45.002925+00	PUBLICADO	Teatro	\N	Gala a beneficio de las becas de la universidad.	2026-10-22 07:57:44.981+00	https://picsum.photos/seed/evt-gala/600/800	120	120
e0000004-0000-4000-8000-000000000004	Festival de Verano 2026	2026-06-24 04:57:44.981+00	Parque Simón Bolívar	Bogotá	t	2026-09-22 04:57:45.002925+00	PUBLICADO	Festivales	\N	El festival gratuito más grande de la ciudad.	2026-06-24 12:57:44.981+00	https://picsum.photos/seed/evt-4/600/800	\N	0
e0000005-0000-4000-8000-000000000005	Feria Gastronómica	2026-10-08 04:57:44.981+00	Corferias	Bogotá	f	2026-09-22 04:57:45.002925+00	PUBLICADO	Gastronomía	\N	Más de 80 restaurantes y productores locales.	2026-10-08 13:57:44.981+00	https://picsum.photos/seed/evt-3/600/800	\N	0
e0000006-0000-4000-8000-000000000006	Sinfónica de Medellín	2026-11-11 04:57:44.981+00	Teatro Metropolitano	Medellín	t	2026-09-22 04:57:45.002925+00	PUBLICADO	Teatro	Orquesta Filarmónica de Medellín	Programa de temporada: Beethoven y Dvořák.	2026-11-11 06:57:44.981+00	https://picsum.photos/seed/evt-5/600/800	\N	0
e0000007-0000-4000-8000-000000000007	Clásico del Fútbol Colombiano	2026-10-28 04:57:44.981+00	Estadio Atanasio Girardot	Medellín	t	2026-09-22 04:57:45.002925+00	PUBLICADO	Deportes	\N	El partido más esperado de la temporada.	2026-10-28 06:57:44.981+00	https://picsum.photos/seed/evt-6/600/800	\N	0
e0000008-0000-4000-8000-000000000008	Salsa al Parque	2026-11-24 04:57:44.981+00	Plaza de Toros	Cali	t	2026-09-22 04:57:45.002925+00	PUBLICADO	Conciertos	Grupo Niche	La capital de la salsa celebra a su orquesta insignia.	2026-11-24 10:57:44.981+00	https://picsum.photos/seed/evt-7/600/800	\N	0
e0000009-0000-4000-8000-000000000009	Bogotá Coffee Week	2026-10-01 04:57:44.981+00	Ágora	Bogotá	f	2026-09-22 04:57:45.002925+00	PUBLICADO	Gastronomía	\N	Catas, baristas y fincas cafeteras de todo el país.	2026-10-01 12:57:44.981+00	https://picsum.photos/seed/evt-8/600/800	\N	0
e000000a-0000-4000-8000-00000000000a	El Mago de Oz — Musical	2026-12-08 04:57:44.981+00	Teatro Colsubsidio	Bogotá	t	2026-09-22 04:57:45.002925+00	BORRADOR	Teatro	Compañía Nacional de Musicales	\N	2026-12-08 06:57:44.981+00	https://picsum.photos/seed/evt-9/600/800	\N	0
e000000c-0000-4000-8000-00000000000c	Noche de Stand-up	2026-09-26 04:57:44.981+00	Teatro Pablo Tobón Uribe	Medellín	t	2026-09-22 04:57:45.002925+00	PUBLICADO	Teatro	Alejandro Riaño	Dos horas de comedia en vivo.	2026-09-26 06:57:44.981+00	https://picsum.photos/seed/evt-standup/600/800	\N	0
e000000d-0000-4000-8000-00000000000d	Jazz al Atardecer	2026-09-23 00:09:44.981+00	Teatro Mayor Julio Mario Santo Domingo	Bogotá	t	2026-09-22 04:57:45.002925+00	PUBLICADO	Conciertos	Antonio Arnedo	Jazz colombiano con vista al atardecer.	2026-09-23 03:09:44.981+00	https://picsum.photos/seed/evt-jazz/600/800	\N	0
e000000b-0000-4000-8000-00000000000b	Torneo Nacional de Voleibol	2026-10-12 04:57:44.981+00	Coliseo El Pueblo	Cali	t	2026-09-22 04:57:45.002925+00	CANCELADO	Deportes	\N	\N	\N	https://picsum.photos/seed/evt-10/600/800	\N	0
\.


--
-- Data for Name: historial_propietarios; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.historial_propietarios (id, entrada_id, propietario_anterior_id, propietario_nuevo_id, motivo, transaccion_id, codigo_qr_anterior, codigo_qr_nuevo, registrado_en) FROM stdin;
1	20000000-0000-4000-8000-000000000001	\N	a0000001-0000-4000-8000-000000000001	EMISION	\N	\N	HXC-QR-000001	2026-09-22 04:57:45.002925+00
2	20000000-0000-4000-8000-000000000002	\N	a0000001-0000-4000-8000-000000000001	EMISION	\N	\N	HXC-QR-000002	2026-09-22 04:57:45.002925+00
3	20000000-0000-4000-8000-000000000003	\N	a0000002-0000-4000-8000-000000000002	EMISION	\N	\N	HXC-QR-000003	2026-09-22 04:57:45.002925+00
4	20000000-0000-4000-8000-000000000004	\N	a0000003-0000-4000-8000-000000000003	EMISION	\N	\N	HXC-QR-000004	2026-09-22 04:57:45.002925+00
5	20000000-0000-4000-8000-000000000005	\N	a0000001-0000-4000-8000-000000000001	EMISION	\N	\N	HXC-QR-000005	2026-09-22 04:57:45.002925+00
6	20000000-0000-4000-8000-000000000006	\N	a0000002-0000-4000-8000-000000000002	EMISION	\N	\N	HXC-QR-000006	2026-09-22 04:57:45.002925+00
7	20000000-0000-4000-8000-000000000008	\N	a0000002-0000-4000-8000-000000000002	EMISION	\N	\N	HXC-QR-000008	2026-09-22 04:57:45.002925+00
8	20000000-0000-4000-8000-000000000007	\N	a0000003-0000-4000-8000-000000000003	EMISION	\N	\N	HXC-QR-000007	2026-09-22 04:57:45.002925+00
9	20000000-0000-4000-8000-000000000001	a0000001-0000-4000-8000-000000000001	7ddeeb96-41fb-4878-965c-309d443616f4	REVENTA	f0152a52-71d5-4cac-9a26-b54996250c50	HXC-QR-000001	HXC-QR-4jmVclDFIg-Cbfrf	2026-09-22 04:57:45.124846+00
\.


--
-- Data for Name: ingresos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ingresos (id, entrada_id, evento_id, validado_por, punto_acceso, origen, escaneado_en, registrado_en) FROM stdin;
\.


--
-- Data for Name: localidades_evento; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.localidades_evento (localidad_id, evento_id, nombre, precio, aforo, vendidas, orden, actualizada_en, reservadas) FROM stdin;
10000001-0000-4000-8000-000000000001	e0000001-0000-4000-8000-000000000001	General	180000.00	5000	4200	1	2026-09-22 04:57:45.002925+00	0
10000001-0000-4000-8000-000000000003	e0000001-0000-4000-8000-000000000001	Platea Baja	260000.00	1500	900	2	2026-09-22 04:57:45.002925+00	0
10000001-0000-4000-8000-000000000002	e0000001-0000-4000-8000-000000000001	Palco VIP	420000.00	200	163	3	2026-09-22 04:57:45.002925+00	0
10000002-0000-4000-8000-000000000001	e0000002-0000-4000-8000-000000000002	General	95000.00	3000	1200	1	2026-09-22 04:57:45.002925+00	0
10000002-0000-4000-8000-000000000002	e0000002-0000-4000-8000-000000000002	Tribuna	140000.00	800	150	2	2026-09-22 04:57:45.002925+00	0
10000003-0000-4000-8000-000000000001	e0000003-0000-4000-8000-000000000003	Platea	300000.00	400	120	1	2026-09-22 04:57:45.002925+00	0
10000004-0000-4000-8000-000000000001	e0000004-0000-4000-8000-000000000004	General	65000.00	20000	18000	1	2026-09-22 04:57:45.002925+00	0
10000005-0000-4000-8000-000000000001	e0000005-0000-4000-8000-000000000005	General	40000.00	6000	800	1	2026-09-22 04:57:45.002925+00	0
10000006-0000-4000-8000-000000000001	e0000006-0000-4000-8000-000000000006	Luneta	70000.00	900	300	1	2026-09-22 04:57:45.002925+00	0
10000006-0000-4000-8000-000000000002	e0000006-0000-4000-8000-000000000006	Balcón	110000.00	400	60	2	2026-09-22 04:57:45.002925+00	0
10000007-0000-4000-8000-000000000001	e0000007-0000-4000-8000-000000000007	Norte	55000.00	12000	12000	1	2026-09-22 04:57:45.002925+00	0
10000007-0000-4000-8000-000000000002	e0000007-0000-4000-8000-000000000007	Occidental	130000.00	8000	7100	2	2026-09-22 04:57:45.002925+00	0
10000008-0000-4000-8000-000000000001	e0000008-0000-4000-8000-000000000008	General	60000.00	4000	4000	1	2026-09-22 04:57:45.002925+00	0
10000008-0000-4000-8000-000000000002	e0000008-0000-4000-8000-000000000008	Preferencial	95000.00	1000	1000	2	2026-09-22 04:57:45.002925+00	0
10000009-0000-4000-8000-000000000001	e0000009-0000-4000-8000-000000000009	Entrada general	35000.00	2500	400	1	2026-09-22 04:57:45.002925+00	0
1000000a-0000-4000-8000-000000000001	e000000a-0000-4000-8000-00000000000a	Platea	85000.00	700	0	1	2026-09-22 04:57:45.002925+00	0
1000000c-0000-4000-8000-000000000001	e000000c-0000-4000-8000-00000000000c	General	70000.00	600	240	1	2026-09-22 04:57:45.002925+00	0
1000000d-0000-4000-8000-000000000001	e000000d-0000-4000-8000-00000000000d	Terraza	150000.00	100	97	1	2026-09-22 04:57:45.002925+00	0
\.


--
-- Data for Name: migraciones; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.migraciones (id, "timestamp", name) FROM stdin;
2	1789257600000	EsquemaInicialCu0061789257600000
3	1789344000000	SecuenciaNumeroTransaccion1789344000000
5	1789776000000	CarteleraCu0051789776000000
6	1789862400000	VentaPrimariaCu001a0041789862400000
\.


--
-- Data for Name: publicaciones_reventa; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.publicaciones_reventa (id, entrada_id, vendedor_id, precio, precio_original, estado, comprador_id, fecha_publicacion, fecha_expiracion, fecha_cierre, creada_en, actualizada_en) FROM stdin;
fca628a7-464e-4592-ae62-4f4ccaab6c4d	20000000-0000-4000-8000-000000000001	a0000001-0000-4000-8000-000000000001	300000.00	250000.00	VENDIDA	7ddeeb96-41fb-4878-965c-309d443616f4	2026-09-22 04:57:45.078476+00	2026-12-21 04:57:44.981+00	2026-09-22 04:57:45.125+00	2026-09-22 04:57:45.078476+00	2026-09-22 04:57:45.124846+00
\.


--
-- Data for Name: transacciones_reventa; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.transacciones_reventa (id, publicacion_id, entrada_id, comprador_id, vendedor_id, precio, comision, neto_vendedor, estado, referencia_pasarela, motivo, numero_transaccion, creada_en, actualizada_en) FROM stdin;
f29284ff-2549-46b4-9148-a3f4cc52be73	fca628a7-464e-4592-ae62-4f4ccaab6c4d	20000000-0000-4000-8000-000000000001	6f4ca075-b892-4155-9b13-6388dc4ce25b	a0000001-0000-4000-8000-000000000001	300000.00	30000.00	270000.00	PENDIENTE	\N	\N	TXN-2026-000341	2026-09-22 04:57:45.095031+00	2026-09-22 04:57:45.095031+00
f0152a52-71d5-4cac-9a26-b54996250c50	fca628a7-464e-4592-ae62-4f4ccaab6c4d	20000000-0000-4000-8000-000000000001	7ddeeb96-41fb-4878-965c-309d443616f4	a0000001-0000-4000-8000-000000000001	300000.00	30000.00	270000.00	APROBADA	pas_c69801e6-d027-42db-a822-3fff8efbb7a4	\N	TXN-2026-000342	2026-09-22 04:57:45.115166+00	2026-09-22 04:57:45.124846+00
\.


--
-- Data for Name: usos_promocion; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.usos_promocion (id, codigo, compra_id, usuario_id, descuento, estado, registrado_en, actualizado_en) FROM stdin;
\.


--
-- Name: historial_propietarios_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.historial_propietarios_id_seq', 9, true);


--
-- Name: migraciones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.migraciones_id_seq', 6, true);


--
-- Name: numero_compra_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.numero_compra_seq', 1, false);


--
-- Name: numero_ticket_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.numero_ticket_seq', 1000, false);


--
-- Name: numero_transaccion_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.numero_transaccion_seq', 342, true);


--
-- Name: usos_promocion_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.usos_promocion_id_seq', 1, false);


--
-- Name: migraciones PK_c790b3af92e49234538c56f4abb; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migraciones
    ADD CONSTRAINT "PK_c790b3af92e49234538c56f4abb" PRIMARY KEY (id);


--
-- Name: cancelaciones cancelaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cancelaciones
    ADD CONSTRAINT cancelaciones_pkey PRIMARY KEY (id);


--
-- Name: codigos_promocionales codigos_promocionales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.codigos_promocionales
    ADD CONSTRAINT codigos_promocionales_pkey PRIMARY KEY (codigo);


--
-- Name: compras compras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compras
    ADD CONSTRAINT compras_pkey PRIMARY KEY (id);


--
-- Name: entradas entradas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entradas
    ADD CONSTRAINT entradas_pkey PRIMARY KEY (id);


--
-- Name: eventos_referencia eventos_referencia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos_referencia
    ADD CONSTRAINT eventos_referencia_pkey PRIMARY KEY (evento_id);


--
-- Name: historial_propietarios historial_propietarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_propietarios
    ADD CONSTRAINT historial_propietarios_pkey PRIMARY KEY (id);


--
-- Name: ingresos ingresos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingresos
    ADD CONSTRAINT ingresos_pkey PRIMARY KEY (id);


--
-- Name: localidades_evento localidades_evento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.localidades_evento
    ADD CONSTRAINT localidades_evento_pkey PRIMARY KEY (localidad_id);


--
-- Name: publicaciones_reventa publicaciones_reventa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publicaciones_reventa
    ADD CONSTRAINT publicaciones_reventa_pkey PRIMARY KEY (id);


--
-- Name: transacciones_reventa transacciones_reventa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transacciones_reventa
    ADD CONSTRAINT transacciones_reventa_pkey PRIMARY KEY (id);


--
-- Name: compras uq_compras_numero; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compras
    ADD CONSTRAINT uq_compras_numero UNIQUE (numero_compra);


--
-- Name: entradas uq_entradas_codigo_qr; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entradas
    ADD CONSTRAINT uq_entradas_codigo_qr UNIQUE (codigo_qr);


--
-- Name: entradas uq_entradas_numero_ticket; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entradas
    ADD CONSTRAINT uq_entradas_numero_ticket UNIQUE (numero_ticket);


--
-- Name: ingresos uq_ingresos_entrada; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingresos
    ADD CONSTRAINT uq_ingresos_entrada UNIQUE (entrada_id);


--
-- Name: localidades_evento uq_localidades_nombre_por_evento; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.localidades_evento
    ADD CONSTRAINT uq_localidades_nombre_por_evento UNIQUE (evento_id, nombre);


--
-- Name: transacciones_reventa uq_transacciones_numero; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transacciones_reventa
    ADD CONSTRAINT uq_transacciones_numero UNIQUE (numero_transaccion);


--
-- Name: usos_promocion usos_promocion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usos_promocion
    ADD CONSTRAINT usos_promocion_pkey PRIMARY KEY (id);


--
-- Name: idx_cancelaciones_compra; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cancelaciones_compra ON public.cancelaciones USING btree (compra_id);


--
-- Name: idx_compras_comprador; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compras_comprador ON public.compras USING btree (comprador_id);


--
-- Name: idx_compras_reservas_vivas; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compras_reservas_vivas ON public.compras USING btree (expira_en) WHERE (estado = 'PENDIENTE'::public.compra_estado);


--
-- Name: idx_entradas_compra; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entradas_compra ON public.entradas USING btree (compra_id);


--
-- Name: idx_entradas_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entradas_evento ON public.entradas USING btree (evento_id);


--
-- Name: idx_entradas_propietario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entradas_propietario ON public.entradas USING btree (propietario_id);


--
-- Name: idx_eventos_cartelera; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eventos_cartelera ON public.eventos_referencia USING btree (fecha_inicio) WHERE (estado = 'PUBLICADO'::public.evento_estado);


--
-- Name: idx_eventos_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eventos_categoria ON public.eventos_referencia USING btree (lower((categoria)::text));


--
-- Name: idx_eventos_ciudad; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eventos_ciudad ON public.eventos_referencia USING btree (lower((ciudad)::text));


--
-- Name: idx_historial_entrada; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historial_entrada ON public.historial_propietarios USING btree (entrada_id, id);


--
-- Name: idx_ingresos_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingresos_evento ON public.ingresos USING btree (evento_id);


--
-- Name: idx_localidades_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_localidades_evento ON public.localidades_evento USING btree (evento_id);


--
-- Name: idx_publicaciones_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_publicaciones_estado ON public.publicaciones_reventa USING btree (estado);


--
-- Name: idx_publicaciones_mercado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_publicaciones_mercado ON public.publicaciones_reventa USING btree (estado, fecha_publicacion) WHERE (estado = 'ACTIVA'::public.publicacion_estado);


--
-- Name: idx_publicaciones_vendedor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_publicaciones_vendedor ON public.publicaciones_reventa USING btree (vendedor_id);


--
-- Name: idx_transacciones_comprador; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transacciones_comprador ON public.transacciones_reventa USING btree (comprador_id);


--
-- Name: idx_transacciones_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transacciones_estado ON public.transacciones_reventa USING btree (estado);


--
-- Name: idx_transacciones_publicacion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transacciones_publicacion ON public.transacciones_reventa USING btree (publicacion_id);


--
-- Name: idx_usos_promocion_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usos_promocion_codigo ON public.usos_promocion USING btree (codigo);


--
-- Name: uq_publicacion_activa_por_entrada; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_publicacion_activa_por_entrada ON public.publicaciones_reventa USING btree (entrada_id) WHERE (estado = 'ACTIVA'::public.publicacion_estado);


--
-- Name: uq_uso_vivo_por_compra; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_uso_vivo_por_compra ON public.usos_promocion USING btree (compra_id) WHERE (estado <> 'LIBERADO'::public.uso_promocion_estado);


--
-- Name: historial_propietarios trg_historial_propietarios_inmutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_historial_propietarios_inmutable BEFORE DELETE OR UPDATE ON public.historial_propietarios FOR EACH ROW EXECUTE FUNCTION public.historial_propietarios_solo_insercion();


--
-- Name: cancelaciones fk_cancelaciones_compra; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cancelaciones
    ADD CONSTRAINT fk_cancelaciones_compra FOREIGN KEY (compra_id) REFERENCES public.compras(id) ON DELETE RESTRICT;


--
-- Name: entradas fk_entradas_compra; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entradas
    ADD CONSTRAINT fk_entradas_compra FOREIGN KEY (compra_id) REFERENCES public.compras(id) ON DELETE RESTRICT;


--
-- Name: historial_propietarios fk_historial_entrada; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_propietarios
    ADD CONSTRAINT fk_historial_entrada FOREIGN KEY (entrada_id) REFERENCES public.entradas(id) ON DELETE RESTRICT;


--
-- Name: ingresos fk_ingresos_entrada; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingresos
    ADD CONSTRAINT fk_ingresos_entrada FOREIGN KEY (entrada_id) REFERENCES public.entradas(id) ON DELETE RESTRICT;


--
-- Name: publicaciones_reventa fk_publicaciones_entrada; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publicaciones_reventa
    ADD CONSTRAINT fk_publicaciones_entrada FOREIGN KEY (entrada_id) REFERENCES public.entradas(id) ON DELETE RESTRICT;


--
-- Name: transacciones_reventa fk_transacciones_entrada; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transacciones_reventa
    ADD CONSTRAINT fk_transacciones_entrada FOREIGN KEY (entrada_id) REFERENCES public.entradas(id) ON DELETE RESTRICT;


--
-- Name: transacciones_reventa fk_transacciones_publicacion; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transacciones_reventa
    ADD CONSTRAINT fk_transacciones_publicacion FOREIGN KEY (publicacion_id) REFERENCES public.publicaciones_reventa(id) ON DELETE RESTRICT;


--
-- Name: usos_promocion fk_usos_codigo; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usos_promocion
    ADD CONSTRAINT fk_usos_codigo FOREIGN KEY (codigo) REFERENCES public.codigos_promocionales(codigo) ON DELETE RESTRICT;


--
-- Name: usos_promocion fk_usos_compra; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usos_promocion
    ADD CONSTRAINT fk_usos_compra FOREIGN KEY (compra_id) REFERENCES public.compras(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict 5klb1Of7NnUZIOkoGK3bOlSyPS8T1AMLu03salfAP898Hl8mFVhWnyhXVXo03Sh

