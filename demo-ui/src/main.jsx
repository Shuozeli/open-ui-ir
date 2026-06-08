import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  ConfigProvider,
  DatePicker,
  Descriptions,
  Flex,
  Grid,
  Input,
  Layout,
  Menu,
  Modal,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
  theme,
} from "antd";
import {
  CheckCircleOutlined,
  DashboardOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  PlusOutlined,
  ReloadOutlined,
  TableOutlined,
} from "@ant-design/icons";
import { Column, Funnel, Gauge, Heatmap, Line, Liquid, Pie, Radar, RadialBar, Rose, Scatter, Treemap, WordCloud } from "@ant-design/charts";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import "antd/dist/reset.css";
import "./styles.css";

const { Header, Sider, Content } = Layout;
const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;
const BACKEND_URL = "http://docker-yuacx.tail8f3b66.ts.net:8794";
const DEBUG_GLOBAL = "__OPEN_UI_IR_DEBUG__";
const debugListeners = new Set();

const series = [
  { day: "Jun 1", severity: "critical", service: "api", hour: "08", count: 3, response_minutes: 42, request_rate: 820, duration_ms: 7300 },
  { day: "Jun 1", severity: "warning", service: "worker", hour: "12", count: 7, response_minutes: 28, request_rate: 640, duration_ms: 4200 },
  { day: "Jun 2", severity: "info", service: "batch-worker", hour: "16", count: 9, response_minutes: 18, request_rate: 410, duration_ms: 2200 },
  { day: "Jun 2", severity: "critical", service: "worker", hour: "20", count: 2, response_minutes: 51, request_rate: 700, duration_ms: 9100 },
  { day: "Jun 3", severity: "warning", service: "api", hour: "10", count: 6, response_minutes: 31, request_rate: 910, duration_ms: 5400 },
  { day: "Jun 4", severity: "info", service: "worker", hour: "14", count: 11, response_minutes: 16, request_rate: 520, duration_ms: 1800 },
  { day: "Jun 5", severity: "critical", service: "api", hour: "18", count: 4, response_minutes: 48, request_rate: 980, duration_ms: 8700 },
  { day: "Jun 6", severity: "warning", service: "batch-worker", hour: "22", count: 8, response_minutes: 35, request_rate: 450, duration_ms: 6100 },
  { day: "Jun 7", severity: "info", service: "api", hour: "06", count: 13, response_minutes: 14, request_rate: 760, duration_ms: 1500 },
];

const fallbackDashboardStats = {
  open_count: 5,
  critical_count: 2,
  ack_rate: 0.6,
};

function DemoShell() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [document, setDocument] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState(readHashRoute());
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [rows, setRows] = useState([]);
  const [seriesRows, setSeriesRows] = useState(series);
  const [dashboardStats, setDashboardStats] = useState(fallbackDashboardStats);
  const [loadingRows, setLoadingRows] = useState(false);
  const [filters, setFilters] = useState({});
  const [locale, setLocale] = useState(readQueryLocale() ?? "en-US");
  const [actionLog, setActionLog] = useState("");
  const [modalAction, setModalAction] = useState(null);
  const [formDraft, setFormDraft] = useState({});
  const [activePanel, setActivePanel] = useState(null);
  const [dataBindingSummaries, setDataBindingSummaries] = useState([]);
  const [bindingErrors, setBindingErrors] = useState([]);
  const debugStateRef = useRef({});
  const openActionRef = useRef(null);

  React.useEffect(() => {
    graphqlRequest(`query UiSpike { uiSpike }`)
      .then((nextDocument) => {
        setDocument(nextDocument.uiSpike);
        setLocale(readQueryLocale() ?? nextDocument.uiSpike.default_locale ?? "en-US");
      });
  }, []);

  React.useEffect(() => {
    if (!document) return;
    loadBackendData({
      document,
      setRows,
      setSelectedIncident,
      setSeriesRows,
      setDashboardStats,
      setLoadingRows,
      setDataBindingSummaries,
      setBindingErrors,
      selectedIncident,
    });
  }, [document]);

  React.useEffect(() => {
    const onHashChange = () => setSelectedRoute(readHashRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const t = (text) => translate(document, locale, text);
  const filteredRows = useMemo(() => filterRows(rows, filters), [rows, filters]);
  const activeRoute = document?.routes.find((route) => route.route === selectedRoute) ?? document?.routes[0];

  const openAction = (action) => {
    if (!action) return;
    if (action.method === "create") {
      setFormDraft({
        title: "",
        service: "api",
        severity: "info",
        acknowledged: false,
      });
      setModalAction(action);
      return;
    }
    if (action.method === "update") {
      if (!selectedIncident) {
        setActionLog(t("No incident selected"));
        return;
      }
      setFormDraft({
        title: selectedIncident.title,
        service: selectedIncident.service,
        severity: selectedIncident.severity,
        acknowledged: selectedIncident.acknowledged,
      });
      setModalAction(action);
      return;
    }
    if (action.method === "delete") {
      if (!selectedIncident) {
        setActionLog(t("No incident selected"));
        return;
      }
      setModalAction(action);
      return;
    }
    runAction(action);
  };

  const runAction = async (action, draft = formDraft) => {
    const result = await applyDemoAction({
      action,
      document,
      selectedIncident,
      draft,
      setSelectedIncident,
      setSelectedRoute: navigateTo,
    });
    setActionLog(t(result));
    setModalAction(null);
    await loadBackendData({
      document,
      setRows,
      setSelectedIncident,
      setSeriesRows,
      setDashboardStats,
      setLoadingRows,
      setDataBindingSummaries,
      setBindingErrors,
      selectedIncident,
    });
  };

  openActionRef.current = openAction;

  React.useEffect(() => {
    debugStateRef.current = {
      document,
      selectedRoute,
      activeRoute,
      selectedIncident,
      rows,
      filters,
      locale,
      modalAction,
      activePanel,
      dataBindingSummaries,
      bindingErrors,
      loadingRows,
    };
    notifyDebugSubscribers(debugStateRef.current);
  }, [document, selectedRoute, activeRoute, selectedIncident, rows, filters, locale, modalAction, activePanel, dataBindingSummaries, bindingErrors, loadingRows]);

  React.useEffect(() => {
    const runtime = createDebugRuntime({
      getState: () => debugStateRef.current,
      commands: {
        openRoute: navigateTo,
        openPanel: setActivePanel,
        openAction: (actionName) => {
          const state = debugStateRef.current;
          const action = findAction(state.document, actionName);
          if (action) openActionRef.current?.(action);
        },
        selectResource: (name) => {
          const state = debugStateRef.current;
          const resource = state.rows?.find((row) => row.name === name);
          if (resource) {
            setSelectedIncident(resource);
          }
        },
        setLocale,
        setFilter: (name, value) => setFilters((current) => ({ ...current, [name]: value })),
        clearFilters: () => setFilters({}),
      },
    });
    window[DEBUG_GLOBAL] = runtime;
    return () => {
      if (window[DEBUG_GLOBAL] === runtime) {
        delete window[DEBUG_GLOBAL];
      }
    };
  }, []);

  if (!document || !activeRoute) {
    return <div className="loading">Loading demo UI...</div>;
  }

  const menuItems = document.routes.map((route) => ({
    key: route.route,
    icon: route.layout === "dashboard" ? <DashboardOutlined /> : route.layout === "detail_page" ? <FileTextOutlined /> : <TableOutlined />,
    label: t(route.title),
  }));

  return (
    <ConfigProvider
      locale={locale === "zh-CN" ? zhCN : enUS}
      theme={{ algorithm: theme.defaultAlgorithm, token: { colorPrimary: "#1677ff", borderRadius: 6 } }}
    >
      <App>
        <Layout className="shell">
          <Sider width={248} className="sidebar">
            <div className="brand">
                <div className="brandMark">IR</div>
                <div>
                <Typography.Text strong>{t(document.display_name)}</Typography.Text>
                <Typography.Text type="secondary">{t("Server-driven UI demo")}</Typography.Text>
              </div>
            </div>
            <Menu mode="inline" selectedKeys={[activeRoute.route]} items={menuItems} onClick={({ key }) => navigateTo(key)} />
            <div className="capabilityPanel">
              <Typography.Text type="secondary">{t("Capabilities")}</Typography.Text>
              <Flex wrap gap={6}>
                {document.capabilities.layouts.map((item) => (
                  <Tag key={item}>{item}</Tag>
                ))}
              </Flex>
            </div>
          </Sider>
          <Layout>
            <Header className="topbar">
              <div>
                <Typography.Title level={3}>{t(activeRoute.title)}</Typography.Title>
                <Typography.Text type="secondary">{t("Rendered from")} {document.protocol_version}</Typography.Text>
              </div>
              <Space className="topbarControls" wrap>
                <Select
                  className="localeSelect"
                  value={locale}
                  options={(document.locales ?? []).map((item) => ({ value: item.locale, label: item.label }))}
                  onChange={setLocale}
                />
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => {
                    setFilters({});
                    setActionLog(t("Filters reset"));
                  }}
                >
                  {t("Refresh")}
                </Button>
              </Space>
            </Header>
            <Content className="content">
              {actionLog ? <Alert className="actionLog" type="success" showIcon message={t("Action result")} description={actionLog} /> : null}
              <RouteRenderer
                route={activeRoute}
                document={document}
                rows={filteredRows}
                loadingRows={loadingRows}
                seriesRows={seriesRows}
                dashboardStats={dashboardStats}
                filters={filters}
                setFilters={setFilters}
                selectedIncident={selectedIncident}
                setSelectedIncident={setSelectedIncident}
                setSelectedRoute={navigateTo}
                runAction={openAction}
                t={t}
                locale={locale}
                activePanel={activePanel}
                isMobile={isMobile}
              />
              <ActionModal
                action={modalAction}
                draft={formDraft}
                setDraft={setFormDraft}
                selectedIncident={selectedIncident}
                onCancel={() => setModalAction(null)}
                onConfirm={() => runAction(modalAction)}
                t={t}
              />
            </Content>
          </Layout>
        </Layout>
      </App>
    </ConfigProvider>
  );
}

function RouteRenderer(props) {
  if (props.route.layout === "crud_list") return <ListPage {...props} />;
  if (props.route.layout === "detail_page") return <DetailPage {...props} />;
  return <DashboardPage {...props} />;
}

function ListPage({ document, rows, loadingRows, filters, setFilters, selectedIncident, setSelectedIncident, setSelectedRoute, runAction, t, locale, activePanel, isMobile }) {
  const collection = document.collections[0];
  return (
    <Space direction="vertical" size={16} className="pageStack">
      <FilterBar collection={collection} filters={filters} setFilters={setFilters} t={t} activePanel={activePanel} />
      <Card
        {...debugPanelProps("table", activePanel)}
        title={t("Incident Events")}
        extra={
          <Space className="actionButtons" wrap>
            {collection.actions.map((action) => (
              <ActionButton key={action.name} action={action} runAction={runAction} t={t} />
            ))}
          </Space>
        }
      >
        {isMobile ? (
          <MobileIncidentList
            rows={rows}
            loading={loadingRows}
            selectedIncident={selectedIncident}
            setSelectedIncident={setSelectedIncident}
            setSelectedRoute={setSelectedRoute}
            t={t}
            locale={locale}
          />
        ) : (
          <Table
            rowKey="name"
            dataSource={rows}
            loading={loadingRows}
            pagination={{ pageSize: 5 }}
            scroll={{ x: "max-content" }}
            rowSelection={{
              type: "radio",
              selectedRowKeys: selectedIncident ? [selectedIncident.name] : [],
              onChange: (_, selectedRows) => {
                if (selectedRows[0]) setSelectedIncident(selectedRows[0]);
              },
            }}
            onRow={(record) => ({
              onClick: () => {
                setSelectedIncident(record);
              },
            })}
            rowClassName={(record) => (record.name === selectedIncident?.name ? "selectedRow" : "")}
            columns={[
              {
                title: t("Title"),
                dataIndex: "title",
                width: 320,
                render: (value, record) => (
                  <Typography.Link
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedIncident(record);
                      setSelectedRoute("/incidents/:name");
                    }}
                  >
                    {value}
                  </Typography.Link>
                ),
              },
              { title: t("Service"), dataIndex: "service", render: (value) => renderService(value, t) },
              { title: t("Severity"), dataIndex: "severity", render: (value) => renderSeverity(value, t) },
              { title: t("Ack"), dataIndex: "acknowledged", render: (value) => (value ? <Badge status="success" text={t("Yes")} /> : <Badge status="warning" text={t("No")} />) },
              { title: t("Duration"), dataIndex: "duration_ms", render: (value) => formatDuration(value, locale) },
              { title: t("Created"), dataIndex: "created_at", render: (value) => formatDate(value, locale) },
            ]}
          />
        )}
      </Card>
    </Space>
  );
}

function MobileIncidentList({ rows, loading, selectedIncident, setSelectedIncident, setSelectedRoute, t, locale }) {
  if (loading) {
    return <div className="mobileListState">{t("Loading demo UI...")}</div>;
  }
  if (!rows.length) {
    return <div className="mobileListState">{t("No incident selected")}</div>;
  }
  return (
    <div className="mobileList">
      {rows.map((row) => (
        <button
          key={row.name}
          type="button"
          className={`mobileListItem ${row.name === selectedIncident?.name ? "mobileListItemSelected" : ""}`}
          onClick={() => setSelectedIncident(row)}
        >
          <span className="mobileListHeader">
            <Typography.Text strong>{row.title}</Typography.Text>
            {renderSeverity(row.severity, t)}
          </span>
          <span className="mobileListMeta">
            {renderService(row.service, t)}
            <Badge status={row.acknowledged ? "success" : "warning"} text={row.acknowledged ? t("Yes") : t("No")} />
          </span>
          <span className="mobileListFacts">
            <span>{formatDate(row.created_at, locale)}</span>
            <span>{formatDuration(row.duration_ms, locale)}</span>
          </span>
          <span className="mobileListFooter">
            <Typography.Text type="secondary">{row.name}</Typography.Text>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedIncident(row);
                setSelectedRoute("/incidents/:name");
              }}
            >
              {t("Open")}
            </Button>
          </span>
        </button>
      ))}
    </div>
  );
}

function FilterBar({ collection, filters, setFilters, t, activePanel }) {
  return (
    <Card {...debugPanelProps("filters", activePanel, "filterBar")}>
      <div className="filterGrid">
        {collection.filters.map((filter) => {
          if (filter.kind === "text") {
            return <Input key={filter.name} allowClear placeholder={t(filter.label)} value={filters[filter.name] ?? ""} onChange={(event) => setFilters({ ...filters, [filter.name]: event.target.value })} />;
          }
          if (filter.kind === "select") {
            return <Select key={filter.name} allowClear placeholder={t(filter.label)} options={translateOptions(filter.options, t)} value={filters[filter.name]} onChange={(value) => setFilters({ ...filters, [filter.name]: value })} />;
          }
          if (filter.kind === "multi_select") {
            return <Select key={filter.name} mode="multiple" allowClear placeholder={t(filter.label)} options={translateOptions(filter.options, t)} value={filters[filter.name]} onChange={(value) => setFilters({ ...filters, [filter.name]: value })} />;
          }
          if (filter.kind === "date_range") {
            return <RangePicker key={filter.name} onChange={(_, value) => setFilters({ ...filters, [filter.name]: value })} />;
          }
          return (
            <Space key={filter.name} className="switchFilter">
              <Typography.Text>{t(filter.label)}</Typography.Text>
              <Switch checked={Boolean(filters[filter.name])} onChange={(value) => setFilters({ ...filters, [filter.name]: value })} />
            </Space>
          );
        })}
      </div>
    </Card>
  );
}

function DetailPage({ selectedIncident, runAction, document, t, locale, activePanel, isMobile }) {
  if (!selectedIncident) {
    return <Alert type="info" showIcon message={t("No incident selected")} />;
  }
  const actions = document.collections[0].actions;
  const acknowledge = actions.find((action) => action.name === "acknowledge");
  const update = actions.find((action) => action.name === "update");
  return (
    <Space direction="vertical" size={16} className="pageStack">
      <Card {...debugPanelProps("header", activePanel)}>
        <Flex justify="space-between" align="start" gap={16} wrap>
          <div>
            <Typography.Title level={3}>{selectedIncident.title}</Typography.Title>
            <Space>{renderService(selectedIncident.service, t)}{renderSeverity(selectedIncident.severity, t)}</Space>
          </div>
          <Space className="detailActions" wrap>
            <Button icon={<CheckCircleOutlined />} onClick={() => runAction(acknowledge)}>{t("Acknowledge")}</Button>
            <Button icon={<EditOutlined />} onClick={() => runAction(update)}>{t("Edit")}</Button>
          </Space>
        </Flex>
      </Card>
      <Card {...debugPanelProps("payload", activePanel)} title={t("Resource Detail")}>
        {isMobile ? (
          <MobileDetailFields selectedIncident={selectedIncident} t={t} locale={locale} />
        ) : (
          <Descriptions bordered column={2} size="middle">
            <Descriptions.Item label={t("Name")}>{selectedIncident.name}</Descriptions.Item>
            <Descriptions.Item label={t("Acknowledged")}>{selectedIncident.acknowledged ? t("Yes") : t("No")}</Descriptions.Item>
            <Descriptions.Item label={t("Created")}>{formatDate(selectedIncident.created_at, locale)}</Descriptions.Item>
            <Descriptions.Item label={t("External URL")}><Typography.Link href={selectedIncident.external_url}>{selectedIncident.external_url}</Typography.Link></Descriptions.Item>
            <Descriptions.Item label={t("Payload")} span={2}><pre className="jsonBlock">{JSON.stringify(selectedIncident.payload, null, 2)}</pre></Descriptions.Item>
          </Descriptions>
        )}
      </Card>
    </Space>
  );
}

function MobileDetailFields({ selectedIncident, t, locale }) {
  const fields = [
    [t("Name"), selectedIncident.name],
    [t("Acknowledged"), selectedIncident.acknowledged ? t("Yes") : t("No")],
    [t("Created"), formatDate(selectedIncident.created_at, locale)],
    [t("External URL"), <Typography.Link href={selectedIncident.external_url}>{selectedIncident.external_url}</Typography.Link>],
  ];
  return (
    <div className="mobileDetailStack">
      {fields.map(([label, value]) => (
        <div key={label} className="mobileDetailField">
          <Typography.Text type="secondary">{label}</Typography.Text>
          <div>{value}</div>
        </div>
      ))}
      <div className="mobileDetailField">
        <Typography.Text type="secondary">{t("Payload")}</Typography.Text>
        <pre className="jsonBlock">{JSON.stringify(selectedIncident.payload, null, 2)}</pre>
      </div>
    </div>
  );
}

function ActionModal({ action, draft, setDraft, selectedIncident, onCancel, onConfirm, t }) {
  if (!action) return null;

  if (action.method === "delete") {
    return (
      <Modal
        open
        title={t("Delete")}
        okText={t("Delete")}
        cancelText={t("Cancel")}
        okButtonProps={{ danger: true }}
        onCancel={onCancel}
        onOk={onConfirm}
      >
        <Typography.Paragraph>
          {t("Delete selected incident?")}
        </Typography.Paragraph>
        <Typography.Text strong>{selectedIncident?.title}</Typography.Text>
      </Modal>
    );
  }

  return (
    <Modal
      open
      title={t(action.label)}
      okText={t(action.label)}
      cancelText={t("Cancel")}
      onCancel={onCancel}
      onOk={onConfirm}
      okButtonProps={{ disabled: action.method === "create" && !draft.title?.trim() }}
    >
      <Space direction="vertical" size={12} className="modalForm">
        <label>
          <Typography.Text>{t("Title")}</Typography.Text>
          <Input value={draft.title ?? ""} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        </label>
        <label>
          <Typography.Text>{t("Service")}</Typography.Text>
          <Select
            value={draft.service}
            options={[
              { value: "api", label: t("API") },
              { value: "batch-worker", label: t("Batch Worker") },
              { value: "worker", label: t("Worker") },
            ]}
            onChange={(service) => setDraft({ ...draft, service })}
          />
        </label>
        <label>
          <Typography.Text>{t("Severity")}</Typography.Text>
          <Select
            value={draft.severity}
            options={[
              { value: "critical", label: t("Critical") },
              { value: "warning", label: t("Warning") },
              { value: "info", label: t("Info") },
            ]}
            onChange={(severity) => setDraft({ ...draft, severity })}
          />
        </label>
        <Space>
          <Typography.Text>{t("Acknowledged")}</Typography.Text>
          <Switch checked={Boolean(draft.acknowledged)} onChange={(acknowledged) => setDraft({ ...draft, acknowledged })} />
        </Space>
      </Space>
    </Modal>
  );
}

function DashboardPage({ route, t, seriesRows, dashboardStats, activePanel, isMobile }) {
  const metricComponent = route.components.find((component) => component.kind === "metric_row");
  const chartComponents = route.components.filter((component) => component.kind === "chart");
  const metrics = metricComponent?.props?.metrics ?? [];
  return (
    <Space direction="vertical" size={16} className="pageStack">
      <div {...debugPanelProps("kpis", activePanel, "metricRow")}>
        {metrics.map((metric) => (
          <Card key={metric.id}>
            <Statistic
              title={t(metric.label)}
              value={formatMetricValue(readPath(dashboardStats, metric.value_path), metric.format)}
              suffix={metric.format === "percent" ? "%" : undefined}
              valueStyle={metric.id === "critical" ? { color: "#cf1322" } : undefined}
            />
          </Card>
        ))}
      </div>
      <div className="chartGrid">
        {chartComponents.map((component) => (
          <Card key={component.id} {...debugPanelProps(component.id, activePanel)} title={t(component.props.chart.title)}>
            <ChartRenderer chart={component.props.chart} rows={seriesRows} dashboardStats={dashboardStats} isMobile={isMobile} />
          </Card>
        ))}
      </div>
    </Space>
  );
}

function ChartRenderer({ chart, rows, dashboardStats, isMobile }) {
  const data = chartData(chart, rows);
  const common = {
    data,
    height: isMobile ? 220 : 260,
    xField: chart.encoding.x,
    yField: chart.encoding.y,
    colorField: chart.encoding.color ?? chart.encoding.category,
    seriesField: chart.encoding.color ?? chart.encoding.category,
    angleField: chart.encoding.value,
    sizeField: chart.encoding.size,
    stack: chart.stack,
    smooth: chart.smooth,
    autoFit: true,
    legend: isMobile ? false : undefined,
  };
  if (chart.kind === "bar") return <Column {...common} />;
  if (chart.kind === "area") return <Line {...common} area />;
  if (chart.kind === "pie") return <Pie {...common} />;
  if (chart.kind === "heatmap") return <Heatmap {...common} />;
  if (chart.kind === "scatter") return <Scatter {...common} />;
  if (chart.kind === "radar") return <Radar {...common} />;
  if (chart.kind === "rose") return <Rose {...common} />;
  if (chart.kind === "radial_bar") return <RadialBar {...common} startAngle={-Math.PI / 2} maxAngle={Math.PI * 1.5} radius={0.9} innerRadius={0.2} />;
  if (chart.kind === "funnel") return <Funnel {...common} />;
  if (chart.kind === "treemap") return <Treemap data={data} height={common.height} colorField="name" legend={isMobile ? false : undefined} />;
  if (chart.kind === "word_cloud") return <WordCloud data={data} height={common.height} textField="word" sizeField="weight" colorField="word" legend={false} />;
  if (chart.kind === "gauge") return <Gauge height={common.height} data={metricPercent(dashboardStats, chart.encoding.value)} />;
  if (chart.kind === "liquid") return <Liquid height={common.height} percent={metricPercent(dashboardStats, chart.encoding.value)} />;
  return <Line {...common} />;
}

function chartData(chart, rows) {
  if (["pie", "rose", "funnel"].includes(chart.kind)) {
    const key = chart.encoding.category ?? chart.encoding.color ?? chart.encoding.x ?? "severity";
    const value = chart.encoding.value ?? chart.encoding.y ?? "count";
    return aggregateRows(rows, key, value, key, value);
  }
  if (chart.kind === "radial_bar") {
    const key = chart.encoding.x ?? chart.encoding.category ?? "service";
    const value = chart.encoding.y ?? chart.encoding.value ?? "count";
    return aggregateRows(rows, key, value, key, value);
  }
  if (chart.kind === "treemap") {
    return {
      name: "Services",
      children: aggregateRows(rows, chart.encoding.category ?? chart.encoding.color ?? "service", chart.encoding.value ?? "count").map((row) => ({
        name: row.key,
        value: row.value,
      })),
    };
  }
  if (chart.kind === "word_cloud") {
    return aggregateRows(rows, chart.encoding.category ?? chart.encoding.color ?? "service", chart.encoding.value ?? "count").flatMap((row) => [
      { word: row.key, weight: row.value },
      { word: `${row.key} incidents`, weight: Math.max(1, Math.round(row.value * 0.7)) },
    ]);
  }
  return rows;
}

function aggregateRows(rows, keyField, valueField, outputKeyField = "key", outputValueField = "value") {
  const totals = new Map();
  for (const row of rows) {
    const key = row[keyField] ?? "unknown";
    const value = Number(row[valueField] ?? 0);
    totals.set(key, (totals.get(key) ?? 0) + value);
  }
  return Array.from(totals, ([key, value]) => ({
    [outputKeyField]: key,
    [outputValueField]: value,
    key,
    value,
  }));
}

function metricPercent(metrics, field) {
  if (!field) return 0;
  const value = Number(metrics?.[field] ?? 0);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function ActionButton({ action, runAction, t }) {
  const icon = action.method === "create" ? <PlusOutlined /> : action.method === "update" ? <EditOutlined /> : action.method === "delete" ? <DeleteOutlined /> : <EyeOutlined />;
  return <Button icon={icon} danger={action.method === "delete"} type={action.method === "create" ? "primary" : "default"} onClick={() => runAction(action)}>{t(action.label)}</Button>;
}

function renderSeverity(value, t) {
  const color = value === "critical" ? "red" : value === "warning" ? "gold" : "blue";
  return <Tag color={color}>{t(toTitle(value))}</Tag>;
}

function renderService(value, t) {
  return <Tag color="geekblue">{t(toTitle(value))}</Tag>;
}

function filterRows(rows, filters) {
  return rows.filter((row) => {
    if (filters.q && !row.title.toLowerCase().includes(String(filters.q).toLowerCase())) return false;
    if (filters.service && row.service !== filters.service) return false;
    if (filters.severity?.length && !filters.severity.includes(row.severity)) return false;
    if (filters.acknowledged && !row.acknowledged) return false;
    return true;
  });
}

function readHashRoute() {
  const hash = window.location.hash.replace(/^#/, "");
  return hash.startsWith("/") ? hash : "/incidents";
}

function readQueryLocale() {
  return new URLSearchParams(window.location.search).get("locale");
}

function navigateTo(route) {
  window.location.hash = route;
}

async function loadBackendData({
  document,
  setRows,
  setSelectedIncident,
  setSeriesRows,
  setDashboardStats,
  setLoadingRows,
  setDataBindingSummaries,
  setBindingErrors,
  selectedIncident,
}) {
  setLoadingRows(true);
  try {
    assertGraphqlOnlySpec(document);
    const [incidentResult, dashboardResult, seriesResult] = await Promise.all([
      graphqlRequest(`query {
        incidentEvents(pageSize: 50) {
          incidentEvents {
            name
            title
            service
            severity
            acknowledged
            durationMs
            createdAt
            externalUrl
            payload
          }
          nextPageToken
        }
      }`),
      graphqlRequest(`query {
        incidentDashboard {
          openCount
          criticalCount
          ackRate
        }
      }`),
      graphqlRequest(`query {
        incidentSeries {
          points {
            day
            severity
            service
            hour
            count
            responseMinutes
            requestRate
            durationMs
          }
        }
      }`),
    ]);

    const nextRows = incidentResult.incidentEvents.incidentEvents.map(fromGraphqlIncident);
    setRows(nextRows);
    setSeriesRows(seriesResult.incidentSeries.points.map(fromGraphqlSeriesPoint));
    setDashboardStats(fromGraphqlDashboardStats(dashboardResult.incidentDashboard));
    setDataBindingSummaries(createDataBindingSummaries(document, {
      incidentResult,
      dashboardResult,
      seriesResult,
    }));
    setBindingErrors([]);
    setSelectedIncident((current) => {
      const preferred = selectedIncident ?? current;
      return nextRows.find((row) => row.name === preferred?.name) ?? nextRows[0] ?? null;
    });
  } catch (error) {
    setBindingErrors([{ binding: "page-data", message: error.message }]);
    throw error;
  } finally {
    setLoadingRows(false);
  }
}

async function applyDemoAction({ action, document, selectedIncident, draft, setSelectedIncident, setSelectedRoute }) {
  if (!action) return "Action result";
  assertGraphqlBinding(action.binding);

  if (action.method === "get") {
    if (!selectedIncident) return "No incident selected";
    setSelectedRoute("/incidents/:name");
    return "Opened selected incident";
  }

  if (action.binding.operation === "createIncidentEvent") {
    const result = await graphqlRequest(
      `mutation($input: IncidentEventInput!) {
        createIncidentEvent(input: $input) {
          name
          title
          service
          severity
          acknowledged
          durationMs
          createdAt
          externalUrl
          payload
        }
      }`,
      {
        input: {
          title: draft.title,
          service: draft.service,
          severity: draft.severity,
          acknowledged: Boolean(draft.acknowledged),
        },
      },
    );
    setSelectedIncident(fromGraphqlIncident(result.createIncidentEvent));
    return "Created a demo incident";
  }

  if (action.binding.operation === "updateIncidentEvent") {
    if (!selectedIncident) return "No incident selected";
    const result = await graphqlRequest(
      `mutation($name: String!, $input: IncidentEventPatch!) {
        updateIncidentEvent(name: $name, input: $input) {
          name
          title
          service
          severity
          acknowledged
          durationMs
          createdAt
          externalUrl
          payload
        }
      }`,
      {
        name: selectedIncident.name,
        input: {
          title: draft.title,
          service: draft.service,
          severity: draft.severity,
          acknowledged: Boolean(draft.acknowledged),
        },
      },
    );
    setSelectedIncident(fromGraphqlIncident(result.updateIncidentEvent));
    return "Updated selected incident";
  }

  if (action.binding.operation === "acknowledgeIncidentEvent") {
    if (!selectedIncident) return "No incident selected";
    const result = await graphqlRequest(
      `mutation($name: String!) {
        acknowledgeIncidentEvent(name: $name) {
          name
          title
          service
          severity
          acknowledged
          durationMs
          createdAt
          externalUrl
          payload
        }
      }`,
      { name: selectedIncident.name },
    );
    setSelectedIncident(fromGraphqlIncident(result.acknowledgeIncidentEvent));
    return "Acknowledged selected incident";
  }

  if (action.binding.operation === "deleteIncidentEvent") {
    if (!selectedIncident) return "No incident selected";
    await graphqlRequest(
      `mutation($name: String!) {
        deleteIncidentEvent(name: $name)
      }`,
      { name: selectedIncident.name },
    );
    setSelectedIncident(null);
    setSelectedRoute("/incidents");
    return "Deleted selected incident";
  }

  return "Action result";
}

function assertGraphqlBinding(binding) {
  if (!binding || binding.transport !== "graphql") {
    throw new Error("Demo renderer expected a GraphQL binding pushed by the UI Spike");
  }
}

function assertGraphqlOnlySpec(document) {
  const collectionBindings = document.collections.flatMap((collection) => [
    collection.list,
    collection.get,
    ...(collection.actions ?? []).map((action) => action.binding),
  ]);
  const routeBindings = document.routes.flatMap((route) => (route.data_bindings ?? []).map((binding) => binding.query));
  const nonGraphqlBinding = [...collectionBindings, ...routeBindings].find((binding) => binding?.transport !== "graphql");
  if (nonGraphqlBinding) {
    throw new Error(`UI Spike contains a non-GraphQL binding: ${nonGraphqlBinding.operation}`);
  }
}

function createDebugRuntime({ getState, commands }) {
  return {
    version: "open-ui-ir.debug.v1",
    inspect: () => createDebugSnapshot(getState()),
    uiSpike: () => getState().document ?? null,
    uiSummary: () => summarizeUiSpike(getState().document),
    dataSummary: () => getState().dataBindingSummaries ?? [],
    routes: () => summarizeRoutes(getState().document),
    actions: (collectionName) => summarizeActions(getState().document, collectionName),
    panels: (route) => summarizePanels(getState().document, route ?? getState().selectedRoute),
    openRoute: (route) => {
      commands.openRoute(route);
      return { ok: true, requested_route: route };
    },
    openPanel: (panelId) => {
      commands.openPanel(panelId);
      requestAnimationFrame(() => {
        document.querySelector(`[data-debug-panel-id="${cssEscape(panelId)}"]`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
      return { ok: true, requested_panel: panelId };
    },
    openAction: (actionName) => {
      commands.openAction(actionName);
      return { ok: true, requested_action: actionName };
    },
    selectResource: (name) => {
      commands.selectResource(name);
      return { ok: true, requested_resource_name: name };
    },
    setLocale: (locale) => {
      commands.setLocale(locale);
      return { ok: true, requested_locale: locale };
    },
    setFilter: (name, value) => {
      commands.setFilter(name, value);
      return { ok: true, requested_filter: name };
    },
    clearFilters: () => {
      commands.clearFilters();
      return { ok: true, cleared_filters: true };
    },
    subscribe: (listener) => {
      debugListeners.add(listener);
      listener(createDebugSnapshot(getState()));
      return () => debugListeners.delete(listener);
    },
  };
}

function createDebugSnapshot(state) {
  return {
    active_route: state.selectedRoute ?? null,
    active_panel: state.activePanel ?? null,
    active_action: state.modalAction?.name ?? null,
    selected_resource_name: state.selectedIncident?.name ?? null,
    locale: state.locale ?? null,
    ui_spike: summarizeUiSpike(state.document),
    data_bindings: state.dataBindingSummaries ?? [],
    renderer_state: {
      filters: state.filters ?? {},
      loading_bindings: state.loadingRows ? ["incidentEvents", "incidentDashboard", "incidentSeries"] : [],
      failed_bindings: state.bindingErrors ?? [],
    },
  };
}

function summarizeUiSpike(document) {
  if (!document) return null;
  return {
    protocol_version: document.protocol_version,
    app_name: document.app_name,
    display_name: document.display_name,
    default_locale: document.default_locale,
    locales: (document.locales ?? []).map((locale) => locale.locale),
    capabilities: {
      layouts: document.capabilities?.layouts ?? [],
      component_kinds: document.capabilities?.component_kinds ?? [],
      filter_kinds: document.capabilities?.filter_kinds ?? [],
      action_methods: document.capabilities?.action_methods ?? [],
    },
    collections: (document.collections ?? []).map((collection) => collection.name),
    routes: (document.routes ?? []).map((route) => ({
      route: route.route,
      title: route.title,
      layout: route.layout,
      component_ids: (route.components ?? []).map((component) => component.id),
    })),
  };
}

function summarizeRoutes(document) {
  return (document?.routes ?? []).map((route) => ({
    route: route.route,
    title: route.title,
    layout: route.layout,
    data_bindings: (route.data_bindings ?? []).map((binding) => ({
      name: binding.name,
      transport: binding.query?.transport,
      operation: binding.query?.operation,
      result_path: binding.query?.result_path,
    })),
    panels: (route.components ?? []).map((component) => ({
      id: component.id,
      kind: component.kind,
      data_ref: component.data_ref ?? null,
    })),
  }));
}

function summarizeActions(document, collectionName) {
  return (document?.collections ?? [])
    .filter((collection) => !collectionName || collection.name === collectionName)
    .flatMap((collection) =>
      (collection.actions ?? []).map((action) => ({
        collection: collection.name,
        name: action.name,
        label: action.label,
        method: action.method,
        transport: action.binding?.transport,
        operation: action.binding?.operation,
        result_path: action.binding?.result_path,
      })),
    );
}

function summarizePanels(document, route) {
  const selectedRoute = (document?.routes ?? []).find((item) => item.route === route) ?? document?.routes?.[0];
  return (selectedRoute?.components ?? []).map((component) => ({
    route: selectedRoute.route,
    id: component.id,
    kind: component.kind,
    data_ref: component.data_ref ?? null,
  }));
}

function createDataBindingSummaries(document, { incidentResult, dashboardResult, seriesResult }) {
  const listBinding = document.routes.find((route) => route.route === "/incidents")?.data_bindings?.[0]?.query;
  const dashboardRoute = document.routes.find((route) => route.route === "/incidents/dashboard");
  const dashboardBinding = dashboardRoute?.data_bindings?.find((binding) => binding.name === "stats")?.query;
  const seriesBinding = dashboardRoute?.data_bindings?.find((binding) => binding.name === "series")?.query;
  const incidentRows = incidentResult.incidentEvents.incidentEvents;
  const seriesRows = seriesResult.incidentSeries.points;

  return [
    summarizeBinding("incidents", listBinding, {
      resultShape: shapeOf(incidentRows[0]),
      rowCount: incidentRows.length,
      nextPageTokenPresent: Boolean(incidentResult.incidentEvents.nextPageToken),
    }),
    summarizeBinding("stats", dashboardBinding, {
      resultShape: shapeOf(dashboardResult.incidentDashboard),
    }),
    summarizeBinding("series", seriesBinding, {
      resultShape: shapeOf(seriesRows[0]),
      rowCount: seriesRows.length,
    }),
  ].filter(Boolean);
}

function summarizeBinding(name, binding, { resultShape, rowCount, nextPageTokenPresent }) {
  if (!binding) return null;
  return {
    name,
    transport: binding.transport,
    operation: binding.operation,
    result_path: binding.result_path,
    variables_shape: Object.keys(binding.variables ?? {}),
    result_shape: resultShape,
    row_count: rowCount,
    next_page_token_present: nextPageTokenPresent,
    last_loaded_at: new Date().toISOString(),
  };
}

function shapeOf(value) {
  if (!value || typeof value !== "object") return [];
  return Object.keys(value);
}

function notifyDebugSubscribers(state) {
  const snapshot = createDebugSnapshot(state);
  for (const listener of debugListeners) {
    listener(snapshot);
  }
}

function findAction(document, actionName) {
  return (document?.collections ?? [])
    .flatMap((collection) => collection.actions ?? [])
    .find((action) => action.name === actionName || action.label === actionName);
}

function debugPanelProps(id, activePanel, className = "") {
  return {
    "data-debug-panel-id": id,
    className: [className, activePanel === id ? "debugPanelActive" : ""].filter(Boolean).join(" ") || undefined,
  };
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replace(/"/g, '\\"');
}

async function graphqlRequest(query, variables = {}) {
  const response = await fetch(`${BACKEND_URL}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    throw new Error(payload.errors?.[0]?.message ?? `GraphQL request failed: ${response.status}`);
  }
  return payload.data;
}

function fromGraphqlIncident(incident) {
  return {
    name: incident.name,
    title: incident.title,
    service: incident.service,
    severity: incident.severity,
    acknowledged: incident.acknowledged,
    duration_ms: incident.durationMs,
    created_at: incident.createdAt,
    external_url: incident.externalUrl,
    payload: incident.payload,
  };
}

function fromGraphqlSeriesPoint(point) {
  return {
    day: point.day,
    severity: point.severity,
    service: point.service,
    hour: point.hour,
    count: point.count,
    response_minutes: point.responseMinutes,
    request_rate: point.requestRate,
    duration_ms: point.durationMs,
  };
}

function fromGraphqlDashboardStats(stats) {
  return {
    open_count: stats.openCount,
    critical_count: stats.criticalCount,
    ack_rate: stats.ackRate,
  };
}

function translate(document, locale, text) {
  return document?.messages?.[locale]?.[text] ?? text;
}

function translateOptions(options = [], t) {
  return options.map((option) => ({ ...option, label: t(option.label) }));
}

function toTitle(value) {
  if (String(value).toLowerCase() === "api") return "API";
  return String(value)
    .split(/[-_ ]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function readPath(source, path) {
  return path.split(".").reduce((value, key) => value?.[key], source);
}

function formatMetricValue(value, format) {
  if (format === "percent") return Number(value) * 100;
  return value;
}

function formatDate(value, locale) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDuration(value, locale) {
  const seconds = Math.round(value / 100) / 10;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(seconds) + "s";
}

createRoot(document.getElementById("root")).render(<DemoShell />);
