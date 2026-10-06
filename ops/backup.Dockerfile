FROM postgres:18-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends restic cron curl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY backup.sh restore.sh backup-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh /usr/local/bin/backup-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/backup-entrypoint.sh"]
