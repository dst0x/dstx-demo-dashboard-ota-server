--
-- PostgreSQL database dump
--

\restrict wcdh2c3mV1s3JCghlF2q6go6Nl28ZVRkTmM2wodcXQU5MXxYDEbfrhB9YmeJJSc

-- Dumped from database version 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1)
-- Dumped by pg_dump version 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: chat_feedback; Type: TABLE; Schema: public; Owner: ota_admin
--

CREATE TABLE public.chat_feedback (
    id integer NOT NULL,
    message_id bigint,
    rating smallint NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chat_feedback_rating_check CHECK ((rating = ANY (ARRAY[1, '-1'::integer])))
);


ALTER TABLE public.chat_feedback OWNER TO ota_admin;

--
-- Name: chat_feedback_id_seq; Type: SEQUENCE; Schema: public; Owner: ota_admin
--

CREATE SEQUENCE public.chat_feedback_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.chat_feedback_id_seq OWNER TO ota_admin;

--
-- Name: chat_feedback_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ota_admin
--

ALTER SEQUENCE public.chat_feedback_id_seq OWNED BY public.chat_feedback.id;


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: ota_admin
--

CREATE TABLE public.chat_messages (
    id bigint NOT NULL,
    session_id bigint NOT NULL,
    role character varying(20) NOT NULL,
    content text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.chat_messages OWNER TO ota_admin;

--
-- Name: chat_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: ota_admin
--

CREATE SEQUENCE public.chat_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.chat_messages_id_seq OWNER TO ota_admin;

--
-- Name: chat_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ota_admin
--

ALTER SEQUENCE public.chat_messages_id_seq OWNED BY public.chat_messages.id;


--
-- Name: chat_sessions; Type: TABLE; Schema: public; Owner: ota_admin
--

CREATE TABLE public.chat_sessions (
    id bigint NOT NULL,
    session_key character varying(64) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.chat_sessions OWNER TO ota_admin;

--
-- Name: chat_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: ota_admin
--

CREATE SEQUENCE public.chat_sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.chat_sessions_id_seq OWNER TO ota_admin;

--
-- Name: chat_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ota_admin
--

ALTER SEQUENCE public.chat_sessions_id_seq OWNED BY public.chat_sessions.id;


--
-- Name: devices; Type: TABLE; Schema: public; Owner: ota_admin
--

CREATE TABLE public.devices (
    mac_address character varying(50) NOT NULL,
    current_version character varying(50),
    last_seen timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.devices OWNER TO ota_admin;

--
-- Name: firmware_targets; Type: TABLE; Schema: public; Owner: ota_admin
--

CREATE TABLE public.firmware_targets (
    firmware_id integer NOT NULL,
    devid character varying(20) NOT NULL
);


ALTER TABLE public.firmware_targets OWNER TO ota_admin;

--
-- Name: firmwares; Type: TABLE; Schema: public; Owner: ota_admin
--

CREATE TABLE public.firmwares (
    id integer NOT NULL,
    version character varying(50) NOT NULL,
    hardware_target character varying(100) NOT NULL,
    file_path character varying(255) NOT NULL,
    file_size integer NOT NULL,
    checksum character varying(255) NOT NULL,
    release_notes text,
    upload_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.firmwares OWNER TO ota_admin;

--
-- Name: firmwares_id_seq; Type: SEQUENCE; Schema: public; Owner: ota_admin
--

CREATE SEQUENCE public.firmwares_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.firmwares_id_seq OWNER TO ota_admin;

--
-- Name: firmwares_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ota_admin
--

ALTER SEQUENCE public.firmwares_id_seq OWNED BY public.firmwares.id;


--
-- Name: knowledge_base; Type: TABLE; Schema: public; Owner: ota_admin
--

CREATE TABLE public.knowledge_base (
    id integer NOT NULL,
    title character varying(200) NOT NULL,
    category character varying(100) DEFAULT 'Umum'::character varying,
    content text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.knowledge_base OWNER TO ota_admin;

--
-- Name: knowledge_base_id_seq; Type: SEQUENCE; Schema: public; Owner: ota_admin
--

CREATE SEQUENCE public.knowledge_base_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knowledge_base_id_seq OWNER TO ota_admin;

--
-- Name: knowledge_base_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ota_admin
--

ALTER SEQUENCE public.knowledge_base_id_seq OWNED BY public.knowledge_base.id;


--
-- Name: knowledge_files; Type: TABLE; Schema: public; Owner: ota_admin
--

CREATE TABLE public.knowledge_files (
    id integer NOT NULL,
    original_name character varying(255) NOT NULL,
    file_type character varying(20) NOT NULL,
    file_size integer NOT NULL,
    file_path character varying(500) NOT NULL,
    extracted_text text,
    text_search tsvector,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.knowledge_files OWNER TO ota_admin;

--
-- Name: knowledge_files_id_seq; Type: SEQUENCE; Schema: public; Owner: ota_admin
--

CREATE SEQUENCE public.knowledge_files_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knowledge_files_id_seq OWNER TO ota_admin;

--
-- Name: knowledge_files_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ota_admin
--

ALTER SEQUENCE public.knowledge_files_id_seq OWNED BY public.knowledge_files.id;


--
-- Name: modbus_commands; Type: TABLE; Schema: public; Owner: ota_admin
--

CREATE TABLE public.modbus_commands (
    id bigint NOT NULL,
    devid character varying(20) NOT NULL,
    frame character varying(200) NOT NULL,
    description character varying(255),
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    sent_at timestamp without time zone,
    response_frame character varying(200),
    response_status character varying(20),
    responded_at timestamp without time zone
);


ALTER TABLE public.modbus_commands OWNER TO ota_admin;

--
-- Name: modbus_commands_id_seq; Type: SEQUENCE; Schema: public; Owner: ota_admin
--

CREATE SEQUENCE public.modbus_commands_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.modbus_commands_id_seq OWNER TO ota_admin;

--
-- Name: modbus_commands_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ota_admin
--

ALTER SEQUENCE public.modbus_commands_id_seq OWNED BY public.modbus_commands.id;


--
-- Name: ota_devices; Type: TABLE; Schema: public; Owner: ota_admin
--

CREATE TABLE public.ota_devices (
    devid character varying(20) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    last_seen timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.ota_devices OWNER TO ota_admin;

--
-- Name: ota_download_acks; Type: TABLE; Schema: public; Owner: ota_admin
--

CREATE TABLE public.ota_download_acks (
    id bigint NOT NULL,
    devid character varying(20),
    firmware_id integer NOT NULL,
    download_status boolean NOT NULL,
    acknowledged_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.ota_download_acks OWNER TO ota_admin;

--
-- Name: ota_download_acks_id_seq; Type: SEQUENCE; Schema: public; Owner: ota_admin
--

CREATE SEQUENCE public.ota_download_acks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ota_download_acks_id_seq OWNER TO ota_admin;

--
-- Name: ota_download_acks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ota_admin
--

ALTER SEQUENCE public.ota_download_acks_id_seq OWNED BY public.ota_download_acks.id;


--
-- Name: chat_feedback id; Type: DEFAULT; Schema: public; Owner: ota_admin
--

ALTER TABLE ONLY public.chat_feedback ALTER COLUMN id SET DEFAULT nextval('public.chat_feedback_id_seq'::regclass);


--
-- Name: chat_messages id; Type: DEFAULT; Schema: public; Owner: ota_admin
--

ALTER TABLE ONLY public.chat_messages ALTER COLUMN id SET DEFAULT nextval('public.chat_messages_id_seq'::regclass);


--
-- Name: chat_sessions id; Type: DEFAULT; Schema: public; Owner: ota_admin
--

ALTER TABLE ONLY public.chat_sessions ALTER COLUMN id SET DEFAULT nextval('public.chat_sessions_id_seq'::regclass);


--
-- Name: firmwares id; Type: DEFAULT; Schema: public; Owner: ota_admin
--

ALTER TABLE ONLY public.firmwares ALTER COLUMN id SET DEFAULT nextval('public.firmwares_id_seq'::regclass);


--
-- Name: knowledge_base id; Type: DEFAULT; Schema: public; Owner: ota_admin
--

ALTER TABLE ONLY public.knowledge_base ALTER COLUMN id SET DEFAULT nextval('public.knowledge_base_id_seq'::regclass);


--
-- Name: knowledge_files id; Type: DEFAULT; Schema: public; Owner: ota_admin
--

ALTER TABLE ONLY public.knowledge_files ALTER COLUMN id SET DEFAULT nextval('public.knowledge_files_id_seq'::regclass);


--
-- Name: modbus_commands id; Type: DEFAULT; Schema: public; Owner: ota_admin
--

ALTER TABLE ONLY public.modbus_commands ALTER COLUMN id SET DEFAULT nextval('public.modbus_commands_id_seq'::regclass);


--
-- Name: ota_download_acks id; Type: DEFAULT; Schema: public; Owner: ota_admin
--

ALTER TABLE ONLY public.ota_download_acks ALTER COLUMN id SET DEFAULT nextval('public.ota_download_acks_id_seq'::regclass);


--
-- Name: chat_feedback chat_feedback_message_id_key; Type: CONSTRAINT; Schema: public; Owner: ota_admin
--

ALTER TABLE ONLY public.chat_feedback
    ADD CONSTRAINT chat_feedback_message_id_key UNIQUE (message_id);


--
-- Name: chat_feedback chat_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: ota_admin
--

ALTER TABLE ONLY public.chat_feedback
    ADD CONSTRAINT chat_feedback_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: ota_admin
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_sessions chat_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: ota_admin
--

ALTER TABLE ONLY public.chat_sessions
    ADD CONSTRAINT chat_sessions_pkey PRIMARY KEY (id);


--
-- Name: chat_sessions chat_sessions_session_key_key; Type: CONSTRAINT; Schema: public; Owner: ota_admin
--

ALTER TABLE ONLY public.chat_sessions
    ADD CONSTRAINT chat_sessions_session_key_key UNIQUE (session_key);


--
-- Name: devices devices_pkey; Type: CONSTRAINT; Schema: public; Owner: ota_admin
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_pkey PRIMARY KEY (mac_address);


--
-- Name: firmware_targets firmware_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: ota_admin
--

ALTER TABLE ONLY public.firmware_targets
    ADD CONSTRAINT firmware_targets_pkey PRIMARY KEY (firmware_id, devid);


--
-- Name: firmwares firmwares_pkey; Type: CONSTRAINT; Schema: public; Owner: ota_admin
--

ALTER TABLE ONLY public.firmwares
    ADD CONSTRAINT firmwares_pkey PRIMARY KEY (id);


--
-- Name: knowledge_base knowledge_base_pkey; Type: CONSTRAINT; Schema: public; Owner: ota_admin
--

ALTER TABLE ONLY public.knowledge_base
    ADD CONSTRAINT knowledge_base_pkey PRIMARY KEY (id);


--
-- Name: knowledge_files knowledge_files_pkey; Type: CONSTRAINT; Schema: public; Owner: ota_admin
--

ALTER TABLE ONLY public.knowledge_files
    ADD CONSTRAINT knowledge_files_pkey PRIMARY KEY (id);


--
-- Name: modbus_commands modbus_commands_pkey; Type: CONSTRAINT; Schema: public; Owner: ota_admin
--

ALTER TABLE ONLY public.modbus_commands
    ADD CONSTRAINT modbus_commands_pkey PRIMARY KEY (id);


--
-- Name: ota_devices ota_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: ota_admin
--

ALTER TABLE ONLY public.ota_devices
    ADD CONSTRAINT ota_devices_pkey PRIMARY KEY (devid);


--
-- Name: ota_download_acks ota_download_acks_pkey; Type: CONSTRAINT; Schema: public; Owner: ota_admin
--

ALTER TABLE ONLY public.ota_download_acks
    ADD CONSTRAINT ota_download_acks_pkey PRIMARY KEY (id);


--
-- Name: idx_chat_messages_session; Type: INDEX; Schema: public; Owner: ota_admin
--

CREATE INDEX idx_chat_messages_session ON public.chat_messages USING btree (session_id, id);


--
-- Name: idx_knowledge_files_search; Type: INDEX; Schema: public; Owner: ota_admin
--

CREATE INDEX idx_knowledge_files_search ON public.knowledge_files USING gin (text_search);


--
-- Name: idx_modbus_commands_devid_status; Type: INDEX; Schema: public; Owner: ota_admin
--

CREATE INDEX idx_modbus_commands_devid_status ON public.modbus_commands USING btree (devid, status);


--
-- Name: idx_ota_download_acks_device_firmware; Type: INDEX; Schema: public; Owner: ota_admin
--

CREATE UNIQUE INDEX idx_ota_download_acks_device_firmware ON public.ota_download_acks USING btree (devid, firmware_id);


--
-- Name: idx_ota_download_acks_firmware_id; Type: INDEX; Schema: public; Owner: ota_admin
--

CREATE INDEX idx_ota_download_acks_firmware_id ON public.ota_download_acks USING btree (firmware_id);


--
-- Name: chat_feedback chat_feedback_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ota_admin
--

ALTER TABLE ONLY public.chat_feedback
    ADD CONSTRAINT chat_feedback_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ota_admin
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.chat_sessions(id) ON DELETE CASCADE;


--
-- Name: firmware_targets firmware_targets_firmware_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ota_admin
--

ALTER TABLE ONLY public.firmware_targets
    ADD CONSTRAINT firmware_targets_firmware_id_fkey FOREIGN KEY (firmware_id) REFERENCES public.firmwares(id) ON DELETE CASCADE;


--
-- Name: ota_download_acks ota_download_acks_firmware_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ota_admin
--

ALTER TABLE ONLY public.ota_download_acks
    ADD CONSTRAINT ota_download_acks_firmware_id_fkey FOREIGN KEY (firmware_id) REFERENCES public.firmwares(id) ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT ALL ON SCHEMA public TO ota_admin;


--
-- PostgreSQL database dump complete
--

\unrestrict wcdh2c3mV1s3JCghlF2q6go6Nl28ZVRkTmM2wodcXQU5MXxYDEbfrhB9YmeJJSc

