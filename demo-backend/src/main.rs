use std::{net::SocketAddr, sync::Arc};

use async_graphql::{
    http::{playground_source, GraphQLPlaygroundConfig},
    Context, EmptySubscription, InputObject, Json as GqlJson, Object, Schema, SimpleObject,
};
use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::{
    extract::State,
    http::{header::CONTENT_TYPE, HeaderValue, Method, StatusCode},
    response::{Html, IntoResponse},
    routing::{get, post},
    Json as AxumJson, Router,
};
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::json;
use tokio::sync::RwLock;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

type DemoSchema = Schema<QueryRoot, MutationRoot, EmptySubscription>;

#[derive(Clone)]
struct AppState {
    incidents: Arc<RwLock<Vec<IncidentEvent>>>,
}

#[derive(Clone, SimpleObject, Serialize)]
struct IncidentEvent {
    name: String,
    title: String,
    service: String,
    severity: String,
    acknowledged: bool,
    duration_ms: i32,
    created_at: DateTime<Utc>,
    external_url: String,
    payload: serde_json::Value,
}

#[derive(SimpleObject)]
struct IncidentEventConnection {
    incident_events: Vec<IncidentEvent>,
    next_page_token: Option<String>,
}

#[derive(SimpleObject)]
struct IncidentSeries {
    points: Vec<IncidentSeriesPoint>,
}

#[derive(SimpleObject)]
struct IncidentSeriesPoint {
    day: String,
    severity: String,
    service: String,
    hour: String,
    count: i32,
    response_minutes: i32,
    request_rate: i32,
    duration_ms: i32,
}

#[derive(SimpleObject)]
struct IncidentDashboard {
    open_count: i32,
    critical_count: i32,
    ack_rate: f64,
}

#[derive(InputObject)]
struct IncidentEventInput {
    title: String,
    service: String,
    severity: String,
    acknowledged: Option<bool>,
}

#[derive(InputObject)]
struct IncidentEventPatch {
    title: Option<String>,
    service: Option<String>,
    severity: Option<String>,
    acknowledged: Option<bool>,
}

#[derive(Default)]
struct QueryRoot;

#[Object]
impl QueryRoot {
    async fn ui_spike(&self) -> GqlJson<serde_json::Value> {
        GqlJson(ui_spike_document())
    }

    async fn incident_events(
        &self,
        ctx: &Context<'_>,
        page_size: Option<i32>,
        page_token: Option<String>,
        filter: Option<String>,
    ) -> IncidentEventConnection {
        let state = ctx.data_unchecked::<AppState>();
        let incidents = state.incidents.read().await;
        let mut rows: Vec<IncidentEvent> = incidents.clone();

        if let Some(filter) = filter.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
            let needle = filter.to_lowercase();
            rows.retain(|row| {
                row.title.to_lowercase().contains(&needle)
                    || row.service.to_lowercase().contains(&needle)
                    || row.severity.to_lowercase().contains(&needle)
            });
        }

        rows.sort_by(|left, right| {
            right
                .created_at
                .cmp(&left.created_at)
                .then_with(|| left.name.cmp(&right.name))
        });

        let start = page_token
            .and_then(|token| token.parse::<usize>().ok())
            .unwrap_or(0);
        let size = page_size.unwrap_or(50).clamp(1, 100) as usize;
        let end = (start + size).min(rows.len());
        let next_page_token = (end < rows.len()).then(|| end.to_string());

        IncidentEventConnection {
            incident_events: rows[start..end].to_vec(),
            next_page_token,
        }
    }

    async fn incident_event(&self, ctx: &Context<'_>, name: String) -> Option<IncidentEvent> {
        let state = ctx.data_unchecked::<AppState>();
        state
            .incidents
            .read()
            .await
            .iter()
            .find(|incident| incident.name == name)
            .cloned()
    }

    async fn incident_series(&self) -> IncidentSeries {
        IncidentSeries {
            points: seed_series(),
        }
    }

    async fn incident_dashboard(&self, ctx: &Context<'_>) -> IncidentDashboard {
        let state = ctx.data_unchecked::<AppState>();
        let incidents = state.incidents.read().await;
        dashboard_stats(&incidents)
    }
}

#[derive(Default)]
struct MutationRoot;

#[Object]
impl MutationRoot {
    async fn create_incident_event(
        &self,
        ctx: &Context<'_>,
        input: IncidentEventInput,
    ) -> IncidentEvent {
        let state = ctx.data_unchecked::<AppState>();
        let mut incidents = state.incidents.write().await;
        let id = next_incident_id(&incidents);
        let incident = IncidentEvent {
            name: format!("incidents/inc-{id}"),
            title: input.title,
            service: input.service,
            severity: input.severity,
            acknowledged: input.acknowledged.unwrap_or(false),
            duration_ms: 0,
            created_at: Utc::now(),
            external_url: format!("https://status.example.com/incidents/inc-{id}"),
            payload: json!({ "source": "graphql-demo-backend" }),
        };
        incidents.push(incident.clone());
        incident
    }

    async fn update_incident_event(
        &self,
        ctx: &Context<'_>,
        name: String,
        input: IncidentEventPatch,
    ) -> Option<IncidentEvent> {
        let state = ctx.data_unchecked::<AppState>();
        let mut incidents = state.incidents.write().await;
        let incident = incidents.iter_mut().find(|incident| incident.name == name)?;

        if let Some(title) = input.title {
            incident.title = title;
        }
        if let Some(service) = input.service {
            incident.service = service;
        }
        if let Some(severity) = input.severity {
            incident.severity = severity;
        }
        if let Some(acknowledged) = input.acknowledged {
            incident.acknowledged = acknowledged;
        }
        incident.duration_ms += 1000;
        incident.payload = json!({
            "source": "graphql-demo-backend",
            "operation": "updateIncidentEvent"
        });

        Some(incident.clone())
    }

    async fn acknowledge_incident_event(
        &self,
        ctx: &Context<'_>,
        name: String,
    ) -> Option<IncidentEvent> {
        let state = ctx.data_unchecked::<AppState>();
        let mut incidents = state.incidents.write().await;
        let incident = incidents.iter_mut().find(|incident| incident.name == name)?;
        incident.acknowledged = true;
        Some(incident.clone())
    }

    async fn delete_incident_event(&self, ctx: &Context<'_>, name: String) -> bool {
        let state = ctx.data_unchecked::<AppState>();
        let mut incidents = state.incidents.write().await;
        let original_len = incidents.len();
        incidents.retain(|incident| incident.name != name);
        incidents.len() != original_len
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "open_ui_ir_demo_backend=info,tower_http=info".into()),
        )
        .init();

    let state = AppState {
        incidents: Arc::new(RwLock::new(seed_incidents())),
    };
    let schema = Schema::build(QueryRoot, MutationRoot, EmptySubscription)
        .data(state.clone())
        .finish();

    let app = Router::new()
        .route("/health", get(health))
        .route("/graphql", get(graphql_playground).post(graphql_handler))
        .route("/api/incidents/dashboard", get(dashboard))
        .route("/api/incidents/{name}/acknowledge", post(rest_acknowledge))
        .layer(
            CorsLayer::new()
                .allow_origin("*".parse::<HeaderValue>().expect("valid wildcard origin"))
                .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE])
                .allow_headers([CONTENT_TYPE]),
        )
        .layer(TraceLayer::new_for_http())
        .with_state((schema, state));

    let bind_addr = std::env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8794".to_string());
    let addr: SocketAddr = bind_addr.parse().expect("BIND_ADDR must be host:port");
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind demo backend");
    tracing::info!(%addr, "open-ui-ir demo backend listening");
    axum::serve(listener, app).await.expect("serve demo backend");
}

async fn health() -> AxumJson<serde_json::Value> {
    AxumJson(json!({ "status": "ok" }))
}

async fn graphql_playground() -> impl IntoResponse {
    Html(playground_source(GraphQLPlaygroundConfig::new("/graphql")))
}

async fn graphql_handler(
    State((schema, _state)): State<(DemoSchema, AppState)>,
    request: GraphQLRequest,
) -> GraphQLResponse {
    schema.execute(request.into_inner()).await.into()
}

async fn dashboard(
    State((_schema, state)): State<(DemoSchema, AppState)>,
) -> AxumJson<serde_json::Value> {
    let incidents = state.incidents.read().await;
    let stats = dashboard_stats(&incidents);

    AxumJson(json!({
        "dashboard": {
            "open_count": stats.open_count,
            "critical_count": stats.critical_count,
            "ack_rate": stats.ack_rate
        }
    }))
}

async fn rest_acknowledge(
    State((_schema, state)): State<(DemoSchema, AppState)>,
    axum::extract::Path(name): axum::extract::Path<String>,
) -> impl IntoResponse {
    let decoded_name = name.replace("%2F", "/");
    let mut incidents = state.incidents.write().await;
    let Some(incident) = incidents
        .iter_mut()
        .find(|incident| incident.name == decoded_name)
    else {
        return StatusCode::NOT_FOUND.into_response();
    };
    incident.acknowledged = true;
    AxumJson(json!({ "incident": incident })).into_response()
}

fn ui_spike_document() -> serde_json::Value {
    serde_json::from_str(include_str!("../../examples/all-features.ui.json"))
        .expect("examples/all-features.ui.json must be valid Open UI IR JSON")
}

fn dashboard_stats(incidents: &[IncidentEvent]) -> IncidentDashboard {
    let open_count = incidents.len() as i32;
    let critical_count = incidents
        .iter()
        .filter(|incident| incident.severity == "critical")
        .count() as i32;
    let acknowledged_count = incidents
        .iter()
        .filter(|incident| incident.acknowledged)
        .count() as i32;
    let ack_rate = if open_count == 0 {
        0.0
    } else {
        acknowledged_count as f64 / open_count as f64
    };

    IncidentDashboard {
        open_count,
        critical_count,
        ack_rate,
    }
}

fn next_incident_id(incidents: &[IncidentEvent]) -> i32 {
    incidents
        .iter()
        .filter_map(|incident| incident.name.rsplit('-').next()?.parse::<i32>().ok())
        .max()
        .unwrap_or(1000)
        + 1
}

fn seed_incidents() -> Vec<IncidentEvent> {
    vec![
        incident(
            "incidents/inc-1001",
            "Checkout API elevated latency",
            "api",
            "critical",
            true,
            8420,
            "2026-06-07T08:14:00Z",
            json!({ "region": "us-east", "p95_ms": 1840, "affected_customers": 128 }),
        ),
        incident(
            "incidents/inc-1002",
            "Batch invoice export delayed",
            "batch-worker",
            "warning",
            false,
            31200,
            "2026-06-07T07:39:00Z",
            json!({ "queue_depth": 2184, "retry_count": 3 }),
        ),
        incident(
            "incidents/inc-1003",
            "Worker capacity rebalance complete",
            "worker",
            "info",
            true,
            1240,
            "2026-06-06T23:45:00Z",
            json!({ "old_capacity": 12, "new_capacity": 18 }),
        ),
        incident(
            "incidents/inc-1004",
            "API error-rate watch triggered",
            "api",
            "warning",
            false,
            6390,
            "2026-06-06T18:22:00Z",
            json!({ "error_rate": 0.018, "threshold": 0.01 }),
        ),
        incident(
            "incidents/inc-1005",
            "Worker memory pressure recovered",
            "worker",
            "critical",
            true,
            18770,
            "2026-06-05T16:08:00Z",
            json!({ "max_rss_mb": 7234, "limit_mb": 8192 }),
        ),
    ]
}

fn incident(
    name: &str,
    title: &str,
    service: &str,
    severity: &str,
    acknowledged: bool,
    duration_ms: i32,
    created_at: &str,
    payload: serde_json::Value,
) -> IncidentEvent {
    IncidentEvent {
        name: name.to_string(),
        title: title.to_string(),
        service: service.to_string(),
        severity: severity.to_string(),
        acknowledged,
        duration_ms,
        created_at: created_at
            .parse::<DateTime<Utc>>()
            .expect("seed timestamp must parse"),
        external_url: format!("https://status.example.com/{}", name),
        payload,
    }
}

fn seed_series() -> Vec<IncidentSeriesPoint> {
    vec![
        series_point("Jun 1", "critical", "api", "08", 3, 42, 820, 7300),
        series_point("Jun 1", "warning", "worker", "12", 7, 28, 640, 4200),
        series_point("Jun 2", "info", "batch-worker", "16", 9, 18, 410, 2200),
        series_point("Jun 2", "critical", "worker", "20", 2, 51, 700, 9100),
        series_point("Jun 3", "warning", "api", "10", 6, 31, 910, 5400),
        series_point("Jun 4", "info", "worker", "14", 11, 16, 520, 1800),
        series_point("Jun 5", "critical", "api", "18", 4, 48, 980, 8700),
        series_point("Jun 6", "warning", "batch-worker", "22", 8, 35, 450, 6100),
        series_point("Jun 7", "info", "api", "06", 13, 14, 760, 1500),
    ]
}

fn series_point(
    day: &str,
    severity: &str,
    service: &str,
    hour: &str,
    count: i32,
    response_minutes: i32,
    request_rate: i32,
    duration_ms: i32,
) -> IncidentSeriesPoint {
    IncidentSeriesPoint {
        day: day.to_string(),
        severity: severity.to_string(),
        service: service.to_string(),
        hour: hour.to_string(),
        count,
        response_minutes,
        request_rate,
        duration_ms,
    }
}
