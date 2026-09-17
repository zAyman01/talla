import { defineRailway, postgres, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "sfo" });
  Postgres.networking = { privateNetworkEndpoint: "postgres", tcpProxies: { "5432": {} } };
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "sfo", sizeMB: 500 });
  const admin = service("admin", {
    replicas: { "sfo": 1 },
  });
  const storefront = service("storefront", {
    replicas: { "sfo": 1 },
  });

  return project("talla", {
    resources: [admin, storefront, Postgres, postgresVolume],
  });
});
