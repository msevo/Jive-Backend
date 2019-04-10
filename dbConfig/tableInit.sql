 /* None of this is actually being run on the backend. This is just the sql code that initializes the db. */

/* Personal user information, i.e. account info. */
CREATE TABLE IF NOT EXISTS users (
  id bigint primary key default id_generator(),
  username varchar(20) unique not null,
  email varchar(90) unique not null,
  auth_token bigint not null default id_generator(),
  stream_key varchar(42) default 'live_' || gen_random_uuid(),
  phone varchar(20),
  gender varchar(10),
  birthdate date,
  reset_password_token varchar(40),
  reset_password_expires bigint,
  fb_user boolean default 'f'
);

/* Publically visible information about each user, i.e. displayed on their profile page. */
CREATE TABLE IF NOT EXISTS profiles (
  user_id bigint primary key references users(id),
  username varchar(20) unique not null,
  name varchar(100) not null,
  currently_live boolean not null default 'f',
  stripe_id varchar(255),
  bio varchar(200),
  status varchar(150),
  profile_pic varchar(255) default 'jive-user-photos/profile_pic/defaultProfilePic' || (floor(random()*(5))+1) || '.png',
  cover_photo  varchar(255) default 'jive-user-photos/cover_photo/defaultCoverPhoto' || (floor(random()*(5))+1) || '.png',
  has_streamed boolean default 'f',
  notification_subscription json,
  notification_status smallint default 3,
  facebook_link varchar(255),
  instagram_link varchar(255),
  twitter_link varchar(255),
  spotify_link varchar(255),
  soundcloud_link varchar(255),
  apple_music_link varchar(255),
  bandcamp_link varchar(255)
);

CREATE TABLE IF NOT EXISTS passwords (
  user_id bigint primary key references users(id),
  password bytea not null
);

CREATE TABLE IF NOT EXISTS followers (
  user_id bigint not null references users(id),
  follows_id bigint not null references users(id),
  primary key (user_id, follows_id)
);

CREATE TABLE IF NOT EXISTS stream_information (
  user_id bigint primary key references users(id),
  title varchar(100),
  description varchar(1500),
  tags varchar(255),
  total_views bigint default 0
);

CREATE TABLE IF NOT EXISTS live_streams (
  user_id bigint primary key references users(id),
  thumbnail varchar(255),
  start_timestamp timestamp default now()
);

CREATE TABLE IF NOT EXISTS archived_streams (
  user_id bigint references users(id),
  stream_id bigint default id_generator(),
  stream_file_name varchar(255) not null,
  thumbnail varchar(255) not null,
  start_timestamp timestamp not null,
  total_views bigint default 0,
  duration_seconds int not null,
  title varchar(100) not null,
  description varchar(1500),
  tags varchar(255),
  --public boolean not null,
  primary key (user_id, stream_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  user_id bigint references users(id),
  chat_id bigint default id_generator(),
  sent_to bigint references users(id),
  message varchar(150),
  votes bigint default 0,
  sent_at timestamp default now(),
  primary key (user_id, chat_id, sent_to)
);

CREATE TABLE IF NOT EXISTS user_stats (
  user_id bigint primary key references users(id),
  public boolean not null default 't',
  minutes_streamed bigint default 0,
  minutes_watched bigint default 0,
  num_messages_sent bigint default 0,
  num_messages_received bigint default 0,
  total_views bigint default 0
);

/* code from https://rob.conery.io/2014/05/28/a-better-id-generator-for-postgresql/
  generates random id's */

create sequence public.global_id_sequence;

CREATE OR REPLACE FUNCTION public.id_generator(OUT result bigint) AS $$
DECLARE
    our_epoch bigint := 1314220021721;
    seq_id bigint;
    now_millis bigint;
    -- the id of this DB shard, must be set for each
    -- schema shard you have - you could pass this as a parameter too
    shard_id int := 1;
BEGIN
    SELECT nextval('public.global_id_sequence') % 1024 INTO seq_id;

    SELECT FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000) INTO now_millis;
    result := (now_millis - our_epoch) << 23;
    result := result | (shard_id << 10);
    result := result | (seq_id);
END;
$$ LANGUAGE PLPGSQL;

/* About us page */
CREATE TABLE IF NOT EXISTS email_list (
  name varchar(254),
  email varchar(254),
  date_added timestamp default now()
);

CREATE TABLE IF NOT EXISTS user_transactions (
  transaction_id bigint primary key default id_generator(),
  from_user_id bigint references users(id),
  to_user_id bigint references users(id),
  amount bigint not null,
  currency_code varchar(10) not null,
  date_of_transaction timestamp default now()
);

/* Random number in range generator */
select floor(random()*(b-a+1))+a;
