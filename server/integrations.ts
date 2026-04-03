import { storage } from "./storage";
import type { IntegrationConnection } from "@shared/schema";

// ==================== INTERFACES ====================

export interface PMConnector {
  validateConnection(config: any): Promise<{ valid: boolean; message: string; projectName?: string }>;
  fetchItems(config: any): Promise<RemoteItem[]>;
}

export interface RemoteItem {
  externalId: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  dueDate?: string;
  assignee?: string;
  type: string;
  labels?: string[];
  created?: string;
  updated?: string;
  url?: string;
  customFields?: Record<string, any>;
}

export interface SyncResult {
  status: "success" | "partial" | "failed";
  itemsSynced: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsSkipped: number;
  errors: string[];
  duration: number;
}

// ==================== STATUS MAPPING ====================

const STATUS_MAPS: Record<string, Record<string, string>> = {
  jira: {
    "To Do": "not_started",
    "Backlog": "not_started",
    "Selected for Development": "not_started",
    "In Progress": "in_progress",
    "In Review": "in_progress",
    "In QA": "in_progress",
    "Done": "delivered",
    "Closed": "accepted",
    "Blocked": "at_risk",
    "Won't Do": "non_compliant",
  },
  smartsheet: {
    "Not Started": "not_started",
    "In Progress": "in_progress",
    "Complete": "delivered",
    "Completed": "delivered",
    "Blocked": "at_risk",
    "On Hold": "at_risk",
    "Cancelled": "non_compliant",
  },
  azure_devops: {
    "New": "not_started",
    "Approved": "not_started",
    "Active": "in_progress",
    "Committed": "in_progress",
    "Resolved": "delivered",
    "Closed": "accepted",
    "Removed": "non_compliant",
  },
};

function mapStatus(platform: string, remoteStatus: string): string {
  return STATUS_MAPS[platform]?.[remoteStatus] || "in_progress";
}

function mapPriority(platform: string, remotePriority: string | undefined): string {
  if (!remotePriority) return "standard";
  const lower = remotePriority.toLowerCase();
  if (lower === "highest" || lower === "critical" || lower === "blocker" || lower === "1") return "critical";
  if (lower === "high" || lower === "2") return "high";
  if (lower === "low" || lower === "lowest" || lower === "4" || lower === "5") return "low";
  return "standard";
}

function mapCategory(itemType: string): string {
  const lower = itemType.toLowerCase();
  if (lower === "epic" || lower === "milestone") return "milestone";
  if (lower === "bug" || lower === "defect") return "requirement";
  if (lower === "story" || lower === "user story" || lower === "task" || lower === "sub-task") return "deliverable";
  return "deliverable";
}

// ==================== JIRA CONNECTOR ====================

class JiraConnector implements PMConnector {
  async validateConnection(config: { baseUrl: string; email: string; token: string; projectKey: string }): Promise<{ valid: boolean; message: string; projectName?: string }> {
    try {
      const baseUrl = config.baseUrl.replace(/\/+$/, "");
      const auth = Buffer.from(`${config.email}:${config.token}`).toString("base64");

      const res = await fetch(`${baseUrl}/rest/api/3/project/${config.projectKey}`, {
        headers: {
          "Authorization": `Basic ${auth}`,
          "Accept": "application/json",
        },
      });

      if (!res.ok) {
        const text = await res.text();
        return { valid: false, message: `Jira API error (${res.status}): ${text.slice(0, 200)}` };
      }

      const data = await res.json() as any;
      return { valid: true, message: "Connected successfully", projectName: data.name || config.projectKey };
    } catch (err: any) {
      return { valid: false, message: `Connection failed: ${err.message}` };
    }
  }

  async fetchItems(config: { baseUrl: string; email: string; token: string; projectKey: string }): Promise<RemoteItem[]> {
    const baseUrl = config.baseUrl.replace(/\/+$/, "");
    const auth = Buffer.from(`${config.email}:${config.token}`).toString("base64");
    const headers = {
      "Authorization": `Basic ${auth}`,
      "Accept": "application/json",
    };

    const fields = "summary,status,priority,duedate,assignee,issuetype,labels,created,updated,description";
    const jql = encodeURIComponent(`project=${config.projectKey}`);
    const url = `${baseUrl}/rest/api/3/search?jql=${jql}&maxResults=200&fields=${fields}`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Jira search failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    }

    const data = await res.json() as any;
    const items: RemoteItem[] = [];

    for (const issue of (data.issues || [])) {
      const fields = issue.fields || {};
      items.push({
        externalId: issue.key,
        title: fields.summary || issue.key,
        description: typeof fields.description === "string" ? fields.description : fields.description?.content?.[0]?.content?.[0]?.text || "",
        status: fields.status?.name || "Unknown",
        priority: fields.priority?.name,
        dueDate: fields.duedate || undefined,
        assignee: fields.assignee?.displayName || fields.assignee?.emailAddress || undefined,
        type: fields.issuetype?.name || "task",
        labels: fields.labels || [],
        created: fields.created,
        updated: fields.updated,
        url: `${baseUrl}/browse/${issue.key}`,
      });
    }

    return items;
  }
}

// ==================== SMARTSHEET CONNECTOR ====================

class SmartsheetConnector implements PMConnector {
  async validateConnection(config: { token: string; sheetId: string }): Promise<{ valid: boolean; message: string; projectName?: string }> {
    try {
      const res = await fetch(`https://api.smartsheet.com/2.0/sheets/${config.sheetId}`, {
        headers: {
          "Authorization": `Bearer ${config.token}`,
          "Accept": "application/json",
        },
      });

      if (!res.ok) {
        const text = await res.text();
        return { valid: false, message: `Smartsheet API error (${res.status}): ${text.slice(0, 200)}` };
      }

      const data = await res.json() as any;
      return { valid: true, message: "Connected successfully", projectName: data.name || `Sheet ${config.sheetId}` };
    } catch (err: any) {
      return { valid: false, message: `Connection failed: ${err.message}` };
    }
  }

  async fetchItems(config: { token: string; sheetId: string }): Promise<RemoteItem[]> {
    const res = await fetch(`https://api.smartsheet.com/2.0/sheets/${config.sheetId}`, {
      headers: {
        "Authorization": `Bearer ${config.token}`,
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Smartsheet fetch failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    }

    const data = await res.json() as any;
    const columns: Record<number, string> = {};
    for (const col of (data.columns || [])) {
      columns[col.id] = (col.title || "").toLowerCase();
    }

    const items: RemoteItem[] = [];
    for (const row of (data.rows || [])) {
      const cells: Record<string, string> = {};
      for (const cell of (row.cells || [])) {
        const colName = columns[cell.columnId];
        if (colName && cell.displayValue != null) {
          cells[colName] = String(cell.displayValue);
        }
      }

      const title = cells["task name"] || cells["name"] || cells["title"] || cells["summary"] || "";
      if (!title) continue;

      items.push({
        externalId: String(row.id),
        title,
        description: cells["description"] || cells["details"] || undefined,
        status: cells["status"] || "Not Started",
        priority: cells["priority"] || undefined,
        dueDate: cells["due date"] || cells["due"] || cells["end date"] || undefined,
        assignee: cells["assigned to"] || cells["assignee"] || cells["owner"] || undefined,
        type: cells["type"] || "task",
        labels: [],
        created: row.createdAt,
        updated: row.modifiedAt,
        url: `https://app.smartsheet.com/sheets/${config.sheetId}`,
      });
    }

    return items;
  }
}

// ==================== AZURE DEVOPS CONNECTOR ====================

class AzureDevOpsConnector implements PMConnector {
  async validateConnection(config: { orgUrl: string; pat: string; project: string }): Promise<{ valid: boolean; message: string; projectName?: string }> {
    try {
      const orgUrl = config.orgUrl.replace(/\/+$/, "");
      const auth = Buffer.from(`:${config.pat}`).toString("base64");

      const res = await fetch(`${orgUrl}/_apis/projects/${encodeURIComponent(config.project)}?api-version=7.1`, {
        headers: {
          "Authorization": `Basic ${auth}`,
          "Accept": "application/json",
        },
      });

      if (!res.ok) {
        const text = await res.text();
        return { valid: false, message: `Azure DevOps API error (${res.status}): ${text.slice(0, 200)}` };
      }

      const data = await res.json() as any;
      return { valid: true, message: "Connected successfully", projectName: data.name || config.project };
    } catch (err: any) {
      return { valid: false, message: `Connection failed: ${err.message}` };
    }
  }

  async fetchItems(config: { orgUrl: string; pat: string; project: string }): Promise<RemoteItem[]> {
    const orgUrl = config.orgUrl.replace(/\/+$/, "");
    const auth = Buffer.from(`:${config.pat}`).toString("base64");
    const headers = {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    };

    // Step 1: WIQL query to get work item IDs
    const wiqlUrl = `${orgUrl}/${encodeURIComponent(config.project)}/_apis/wit/wiql?api-version=7.1`;
    const wiqlBody = {
      query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${config.project}' ORDER BY [System.ChangedDate] DESC`,
    };

    const wiqlRes = await fetch(wiqlUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(wiqlBody),
    });

    if (!wiqlRes.ok) {
      throw new Error(`Azure DevOps WIQL failed (${wiqlRes.status}): ${(await wiqlRes.text()).slice(0, 200)}`);
    }

    const wiqlData = await wiqlRes.json() as any;
    const workItemIds: number[] = (wiqlData.workItems || []).slice(0, 200).map((wi: any) => wi.id);

    if (workItemIds.length === 0) return [];

    // Step 2: Batch fetch work items (max 200 per request)
    const idsParam = workItemIds.join(",");
    const fieldsParam = "System.Id,System.Title,System.State,System.WorkItemType,System.AssignedTo,System.CreatedDate,System.ChangedDate,Microsoft.VSTS.Scheduling.DueDate,Microsoft.VSTS.Common.Priority,System.Description";
    const detailsUrl = `${orgUrl}/_apis/wit/workitems?ids=${idsParam}&fields=${fieldsParam}&api-version=7.1`;

    const detailsRes = await fetch(detailsUrl, { headers });
    if (!detailsRes.ok) {
      throw new Error(`Azure DevOps work items fetch failed (${detailsRes.status}): ${(await detailsRes.text()).slice(0, 200)}`);
    }

    const detailsData = await detailsRes.json() as any;
    const items: RemoteItem[] = [];

    for (const wi of (detailsData.value || [])) {
      const f = wi.fields || {};
      const wiId = f["System.Id"] || wi.id;
      items.push({
        externalId: String(wiId),
        title: f["System.Title"] || `Work Item ${wiId}`,
        description: f["System.Description"] || undefined,
        status: f["System.State"] || "New",
        priority: f["Microsoft.VSTS.Common.Priority"] ? String(f["Microsoft.VSTS.Common.Priority"]) : undefined,
        dueDate: f["Microsoft.VSTS.Scheduling.DueDate"] || undefined,
        assignee: f["System.AssignedTo"]?.displayName || f["System.AssignedTo"]?.uniqueName || undefined,
        type: f["System.WorkItemType"] || "task",
        labels: [],
        created: f["System.CreatedDate"],
        updated: f["System.ChangedDate"],
        url: `${orgUrl}/${encodeURIComponent(config.project)}/_workitems/edit/${wiId}`,
      });
    }

    return items;
  }
}

// ==================== CONNECTOR FACTORY ====================

const connectors: Record<string, PMConnector> = {
  jira: new JiraConnector(),
  smartsheet: new SmartsheetConnector(),
  azure_devops: new AzureDevOpsConnector(),
};

export function getConnector(platform: string): PMConnector {
  const connector = connectors[platform];
  if (!connector) {
    throw new Error(`Unsupported platform: ${platform}. Supported: ${Object.keys(connectors).join(", ")}`);
  }
  return connector;
}

// ==================== SYNC ENGINE ====================

export async function syncConnection(connectionId: number): Promise<SyncResult> {
  const connection = storage.getIntegrationConnection(connectionId);
  if (!connection) {
    throw new Error(`Integration connection ${connectionId} not found`);
  }

  const connector = getConnector(connection.platform);
  const config = JSON.parse(connection.config);
  const baselineId = connection.contractId;

  if (!baselineId) {
    throw new Error("No contract linked to this integration. Please set a contract ID.");
  }

  const startTime = Date.now();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    const items = await connector.fetchItems(config);

    for (const item of items) {
      try {
        const mappedStatus = mapStatus(connection.platform, item.status);
        const mappedPriority = mapPriority(connection.platform, item.priority);
        const mappedCategory = mapCategory(item.type);

        // Check if deliverable with this externalId already exists
        const existing = storage.findDeliverableByExternalId(baselineId, item.externalId);

        if (existing) {
          // Update existing deliverable
          storage.updateDeliverable(existing.id, {
            name: item.title,
            status: mappedStatus,
            priority: mappedPriority,
            dueDate: item.dueDate || existing.dueDate,
            description: item.description || existing.description,
            notes: item.assignee ? `Assignee: ${item.assignee}` : existing.notes,
            externalUrl: item.url || existing.externalUrl,
          });
          updated++;
        } else {
          // Create new deliverable with externalId/externalUrl
          storage.createDeliverable({
            baselineId,
            category: mappedCategory,
            name: item.title,
            description: item.description || null,
            dueDate: item.dueDate || null,
            status: mappedStatus,
            priority: mappedPriority,
            notes: item.assignee ? `Assignee: ${item.assignee}` : null,
            contractReference: null,
            externalId: item.externalId,
            externalUrl: item.url || null,
          });
          created++;
        }
      } catch (err: any) {
        errors.push(`Failed to sync item ${item.externalId}: ${err.message}`);
        skipped++;
      }
    }

    const duration = Date.now() - startTime;
    const totalSynced = created + updated;
    const syncStatus = errors.length > 0 ? (totalSynced > 0 ? "partial" : "failed") : "success";

    // Update connection with sync results
    storage.updateIntegrationConnection(connectionId, {
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: syncStatus,
      lastSyncMessage: `${totalSynced} items synced (${created} new, ${updated} updated${errors.length > 0 ? `, ${errors.length} errors` : ""})`,
      syncItemCount: totalSynced,
      status: syncStatus === "failed" ? "error" : "active",
    });

    // Log the sync
    storage.addSyncLog({
      connectionId,
      status: syncStatus,
      itemsSynced: totalSynced,
      itemsCreated: created,
      itemsUpdated: updated,
      itemsSkipped: skipped,
      errors: errors.length > 0 ? JSON.stringify(errors) : null,
      duration,
    });

    return {
      status: syncStatus as SyncResult["status"],
      itemsSynced: totalSynced,
      itemsCreated: created,
      itemsUpdated: updated,
      itemsSkipped: skipped,
      errors,
      duration,
    };
  } catch (err: any) {
    const duration = Date.now() - startTime;

    // Update connection status to error
    storage.updateIntegrationConnection(connectionId, {
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: "failed",
      lastSyncMessage: err.message,
      status: "error",
    });

    // Log the failed sync
    storage.addSyncLog({
      connectionId,
      status: "failed",
      itemsSynced: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsSkipped: 0,
      errors: JSON.stringify([err.message]),
      duration,
    });

    return {
      status: "failed",
      itemsSynced: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsSkipped: 0,
      errors: [err.message],
      duration,
    };
  }
}
