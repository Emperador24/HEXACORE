--
-- PostgreSQL database dump
--

\restrict kMS6DwGleP0aXEZPfeC68aTi9azQkf5gmIqbIkeChgaUXEUhyWWSfobfpOEGjL9

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

ALTER TABLE IF EXISTS ONLY public.transacciones_reventa DROP CONSTRAINT IF EXISTS fk_transacciones_publicacion;
ALTER TABLE IF EXISTS ONLY public.transacciones_reventa DROP CONSTRAINT IF EXISTS fk_transacciones_entrada;
ALTER TABLE IF EXISTS ONLY public.publicaciones_reventa DROP CONSTRAINT IF EXISTS fk_publicaciones_entrada;
ALTER TABLE IF EXISTS ONLY public.historial_propietarios DROP CONSTRAINT IF EXISTS fk_historial_entrada;
DROP TRIGGER IF EXISTS trg_historial_propietarios_inmutable ON public.historial_propietarios;
DROP INDEX IF EXISTS public.uq_publicacion_activa_por_entrada;
DROP INDEX IF EXISTS public.idx_transacciones_publicacion;
DROP INDEX IF EXISTS public.idx_transacciones_estado;
DROP INDEX IF EXISTS public.idx_transacciones_comprador;
DROP INDEX IF EXISTS public.idx_publicaciones_vendedor;
DROP INDEX IF EXISTS public.idx_publicaciones_mercado;
DROP INDEX IF EXISTS public.idx_publicaciones_estado;
DROP INDEX IF EXISTS public.idx_historial_entrada;
DROP INDEX IF EXISTS public.idx_entradas_propietario;
DROP INDEX IF EXISTS public.idx_entradas_evento;
ALTER TABLE IF EXISTS ONLY public.transacciones_reventa DROP CONSTRAINT IF EXISTS uq_transacciones_numero;
ALTER TABLE IF EXISTS ONLY public.entradas DROP CONSTRAINT IF EXISTS uq_entradas_numero_ticket;
ALTER TABLE IF EXISTS ONLY public.entradas DROP CONSTRAINT IF EXISTS uq_entradas_codigo_qr;
ALTER TABLE IF EXISTS ONLY public.transacciones_reventa DROP CONSTRAINT IF EXISTS transacciones_reventa_pkey;
ALTER TABLE IF EXISTS ONLY public.publicaciones_reventa DROP CONSTRAINT IF EXISTS publicaciones_reventa_pkey;
ALTER TABLE IF EXISTS ONLY public.historial_propietarios DROP CONSTRAINT IF EXISTS historial_propietarios_pkey;
ALTER TABLE IF EXISTS ONLY public.eventos_referencia DROP CONSTRAINT IF EXISTS eventos_referencia_pkey;
ALTER TABLE IF EXISTS ONLY public.entradas DROP CONSTRAINT IF EXISTS entradas_pkey;
ALTER TABLE IF EXISTS ONLY public.migraciones DROP CONSTRAINT IF EXISTS "PK_c790b3af92e49234538c56f4abb";
ALTER TABLE IF EXISTS public.migraciones ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.historial_propietarios ALTER COLUMN id DROP DEFAULT;
DROP TABLE IF EXISTS public.transacciones_reventa;
DROP TABLE IF EXISTS public.publicaciones_reventa;
DROP SEQUENCE IF EXISTS public.numero_transaccion_seq;
DROP SEQUENCE IF EXISTS public.migraciones_id_seq;
DROP TABLE IF EXISTS public.migraciones;
DROP SEQUENCE IF EXISTS public.historial_propietarios_id_seq;
DROP TABLE IF EXISTS public.historial_propietarios;
DROP TABLE IF EXISTS public.eventos_referencia;
DROP TABLE IF EXISTS public.entradas;
DROP FUNCTION IF EXISTS public.historial_propietarios_solo_insercion();
DROP TYPE IF EXISTS public.transaccion_estado;
DROP TYPE IF EXISTS public.publicacion_estado;
DROP TYPE IF EXISTS public.motivo_cambio_propietario;
DROP TYPE IF EXISTS public.entrada_estado;
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
-- Name: entrada_estado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.entrada_estado AS ENUM (
    'VALIDA',
    'EN_REVENTA',
    'USADA',
    'ANULADA'
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
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
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
-- Name: historial_propietarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_propietarios ALTER COLUMN id SET DEFAULT nextval('public.historial_propietarios_id_seq'::regclass);


--
-- Name: migraciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migraciones ALTER COLUMN id SET DEFAULT nextval('public.migraciones_id_seq'::regclass);


--
-- Data for Name: entradas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.entradas (id, evento_id, localidad_id, localidad_nombre, propietario_id, codigo_qr, estado, precio_original, numero_ticket, creada_en, actualizada_en) FROM stdin;
20000000-0000-4000-8000-000000000001	e0000001-0000-4000-8000-000000000001	10000001-0000-4000-8000-000000000001	General	a0000001-0000-4000-8000-000000000001	HXC-QR-000001	VALIDA	250000.00	TCK-2026-000001	2026-09-21 02:55:13.380527+00	2026-09-21 02:55:13.380527+00
20000000-0000-4000-8000-000000000002	e0000001-0000-4000-8000-000000000001	10000001-0000-4000-8000-000000000002	Palco VIP	a0000001-0000-4000-8000-000000000001	HXC-QR-000002	VALIDA	600000.00	TCK-2026-000002	2026-09-21 02:55:13.380527+00	2026-09-21 02:55:13.380527+00
20000000-0000-4000-8000-000000000003	e0000002-0000-4000-8000-000000000002	10000002-0000-4000-8000-000000000001	General	a0000002-0000-4000-8000-000000000002	HXC-QR-000003	VALIDA	120000.00	TCK-2026-000003	2026-09-21 02:55:13.380527+00	2026-09-21 02:55:13.380527+00
20000000-0000-4000-8000-000000000004	e0000002-0000-4000-8000-000000000002	10000002-0000-4000-8000-000000000001	General	a0000003-0000-4000-8000-000000000003	HXC-QR-000004	VALIDA	120000.00	TCK-2026-000004	2026-09-21 02:55:13.380527+00	2026-09-21 02:55:13.380527+00
20000000-0000-4000-8000-000000000005	e0000004-0000-4000-8000-000000000004	10000004-0000-4000-8000-000000000001	General	a0000001-0000-4000-8000-000000000001	HXC-QR-000005	USADA	80000.00	TCK-2026-000005	2026-09-21 02:55:13.380527+00	2026-09-21 02:55:13.380527+00
20000000-0000-4000-8000-000000000006	e0000001-0000-4000-8000-000000000001	10000001-0000-4000-8000-000000000001	General	a0000002-0000-4000-8000-000000000002	HXC-QR-000006	ANULADA	250000.00	TCK-2026-000006	2026-09-21 02:55:13.380527+00	2026-09-21 02:55:13.380527+00
20000000-0000-4000-8000-000000000008	e0000004-0000-4000-8000-000000000004	10000004-0000-4000-8000-000000000001	General	a0000002-0000-4000-8000-000000000002	HXC-QR-000008	VALIDA	80000.00	TCK-2026-000008	2026-09-21 02:55:13.380527+00	2026-09-21 02:55:13.380527+00
20000000-0000-4000-8000-000000000007	e0000003-0000-4000-8000-000000000003	10000003-0000-4000-8000-000000000001	Platea	a0000003-0000-4000-8000-000000000003	HXC-QR-000007	VALIDA	300000.00	TCK-2026-000007	2026-09-21 02:55:13.380527+00	2026-09-21 02:55:13.380527+00
\.


--
-- Data for Name: eventos_referencia; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.eventos_referencia (evento_id, nombre, fecha_inicio, lugar, ciudad, permite_reventa, actualizado_en) FROM stdin;
e0000001-0000-4000-8000-000000000001	HEXACORE Fest 2026	2026-12-20 02:55:13.36+00	Movistar Arena	Bogotá	t	2026-09-21 02:55:13.380527+00
e0000002-0000-4000-8000-000000000002	Noche de Rock Nacional	2026-11-05 02:55:13.36+00	Coliseo El Campín	Bogotá	t	2026-09-21 02:55:13.380527+00
e0000003-0000-4000-8000-000000000003	Gala Benéfica Javeriana	2026-10-21 02:55:13.36+00	Teatro Colón	Bogotá	f	2026-09-21 02:55:13.380527+00
e0000004-0000-4000-8000-000000000004	Festival de Verano 2026	2026-06-23 02:55:13.36+00	Parque Simón Bolívar	Bogotá	t	2026-09-21 02:55:13.380527+00
\.


--
-- Data for Name: historial_propietarios; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.historial_propietarios (id, entrada_id, propietario_anterior_id, propietario_nuevo_id, motivo, transaccion_id, codigo_qr_anterior, codigo_qr_nuevo, registrado_en) FROM stdin;
1	20000000-0000-4000-8000-000000000001	\N	a0000001-0000-4000-8000-000000000001	EMISION	\N	\N	HXC-QR-000001	2026-09-21 02:55:13.380527+00
2	20000000-0000-4000-8000-000000000002	\N	a0000001-0000-4000-8000-000000000001	EMISION	\N	\N	HXC-QR-000002	2026-09-21 02:55:13.380527+00
3	20000000-0000-4000-8000-000000000003	\N	a0000002-0000-4000-8000-000000000002	EMISION	\N	\N	HXC-QR-000003	2026-09-21 02:55:13.380527+00
4	20000000-0000-4000-8000-000000000004	\N	a0000003-0000-4000-8000-000000000003	EMISION	\N	\N	HXC-QR-000004	2026-09-21 02:55:13.380527+00
5	20000000-0000-4000-8000-000000000005	\N	a0000001-0000-4000-8000-000000000001	EMISION	\N	\N	HXC-QR-000005	2026-09-21 02:55:13.380527+00
6	20000000-0000-4000-8000-000000000006	\N	a0000002-0000-4000-8000-000000000002	EMISION	\N	\N	HXC-QR-000006	2026-09-21 02:55:13.380527+00
7	20000000-0000-4000-8000-000000000008	\N	a0000002-0000-4000-8000-000000000002	EMISION	\N	\N	HXC-QR-000008	2026-09-21 02:55:13.380527+00
8	20000000-0000-4000-8000-000000000007	\N	a0000003-0000-4000-8000-000000000003	EMISION	\N	\N	HXC-QR-000007	2026-09-21 02:55:13.380527+00
\.


--
-- Data for Name: migraciones; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.migraciones (id, "timestamp", name) FROM stdin;
2	1789257600000	EsquemaInicialCu0061789257600000
3	1789344000000	SecuenciaNumeroTransaccion1789344000000
\.


--
-- Data for Name: publicaciones_reventa; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.publicaciones_reventa (id, entrada_id, vendedor_id, precio, precio_original, estado, comprador_id, fecha_publicacion, fecha_expiracion, fecha_cierre, creada_en, actualizada_en) FROM stdin;
\.


--
-- Data for Name: transacciones_reventa; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.transacciones_reventa (id, publicacion_id, entrada_id, comprador_id, vendedor_id, precio, comision, neto_vendedor, estado, referencia_pasarela, motivo, numero_transaccion, creada_en, actualizada_en) FROM stdin;
\.


--
-- Name: historial_propietarios_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.historial_propietarios_id_seq', 8, true);


--
-- Name: migraciones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.migraciones_id_seq', 3, true);


--
-- Name: numero_transaccion_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.numero_transaccion_seq', 292, true);


--
-- Name: migraciones PK_c790b3af92e49234538c56f4abb; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migraciones
    ADD CONSTRAINT "PK_c790b3af92e49234538c56f4abb" PRIMARY KEY (id);


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
-- Name: transacciones_reventa uq_transacciones_numero; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transacciones_reventa
    ADD CONSTRAINT uq_transacciones_numero UNIQUE (numero_transaccion);


--
-- Name: idx_entradas_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entradas_evento ON public.entradas USING btree (evento_id);


--
-- Name: idx_entradas_propietario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entradas_propietario ON public.entradas USING btree (propietario_id);


--
-- Name: idx_historial_entrada; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historial_entrada ON public.historial_propietarios USING btree (entrada_id, id);


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
-- Name: uq_publicacion_activa_por_entrada; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_publicacion_activa_por_entrada ON public.publicaciones_reventa USING btree (entrada_id) WHERE (estado = 'ACTIVA'::public.publicacion_estado);


--
-- Name: historial_propietarios trg_historial_propietarios_inmutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_historial_propietarios_inmutable BEFORE DELETE OR UPDATE ON public.historial_propietarios FOR EACH ROW EXECUTE FUNCTION public.historial_propietarios_solo_insercion();


--
-- Name: historial_propietarios fk_historial_entrada; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_propietarios
    ADD CONSTRAINT fk_historial_entrada FOREIGN KEY (entrada_id) REFERENCES public.entradas(id) ON DELETE RESTRICT;


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
-- PostgreSQL database dump complete
--

\unrestrict kMS6DwGleP0aXEZPfeC68aTi9azQkf5gmIqbIkeChgaUXEUhyWWSfobfpOEGjL9

