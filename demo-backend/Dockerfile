FROM rust:1.90-slim AS builder

WORKDIR /app
COPY demo-backend/Cargo.toml demo-backend/Cargo.lock ./demo-backend/
COPY demo-backend/src ./demo-backend/src
COPY examples ./examples
RUN cargo build --release --manifest-path demo-backend/Cargo.toml

FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/demo-backend/target/release/open-ui-ir-demo-backend /usr/local/bin/open-ui-ir-demo-backend
ENV BIND_ADDR=0.0.0.0:8794
EXPOSE 8794
CMD ["open-ui-ir-demo-backend"]
