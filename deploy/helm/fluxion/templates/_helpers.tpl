{{/*
Expand the name of the chart.
*/}}
{{- define "fluxion.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "fluxion.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "fluxion.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "fluxion.labels" -}}
helm.sh/chart: {{ include "fluxion.chart" . }}
{{ include "fluxion.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "fluxion.selectorLabels" -}}
app.kubernetes.io/name: {{ include "fluxion.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "fluxion.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "fluxion.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
PostgreSQL fullname
*/}}
{{- define "fluxion.postgresql.fullname" -}}
{{- printf "%s-postgresql" (include "fluxion.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
PostgreSQL service name
*/}}
{{- define "fluxion.postgresql.serviceName" -}}
{{- printf "%s-postgresql" (include "fluxion.fullname" .) }}
{{- end }}

{{/*
PostgreSQL secret name
*/}}
{{- define "fluxion.postgresql.secretName" -}}
{{- if .Values.postgresql.auth.existingSecret }}
{{- .Values.postgresql.auth.existingSecret }}
{{- else }}
{{- printf "%s-postgresql" (include "fluxion.fullname" .) }}
{{- end }}
{{- end }}

{{/*
API fullname
*/}}
{{- define "fluxion.api.fullname" -}}
{{- printf "%s-api" (include "fluxion.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
API secret name
*/}}
{{- define "fluxion.api.secretName" -}}
{{- printf "%s-api" (include "fluxion.fullname" .) }}
{{- end }}

{{/*
API configmap name
*/}}
{{- define "fluxion.api.configMapName" -}}
{{- printf "%s-api" (include "fluxion.fullname" .) }}
{{- end }}

{{/*
OpenTelemetry Collector fullname
*/}}
{{- define "fluxion.otelCollector.fullname" -}}
{{- printf "%s-otel-collector" (include "fluxion.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
OpenTelemetry Collector service name
*/}}
{{- define "fluxion.otelCollector.serviceName" -}}
{{- printf "%s-otel-collector" (include "fluxion.fullname" .) }}
{{- end }}

{{/*
Image reference
*/}}
{{- define "fluxion.image" -}}
{{- $tag := .Values.image.tag | default .Chart.AppVersion }}
{{- printf "%s:%s" .Values.image.repository $tag }}
{{- end }}

{{/*
Database URL
*/}}
{{- define "fluxion.databaseUrl" -}}
{{- $host := include "fluxion.postgresql.serviceName" . }}
{{- $port := .Values.postgresql.service.port }}
{{- $database := .Values.postgresql.auth.database }}
{{- $username := .Values.postgresql.auth.username }}
{{- printf "postgresql+asyncpg://%s:$(POSTGRES_PASSWORD)@%s:%d/%s" $username $host (int $port) $database }}
{{- end }}

{{/*
OTLP endpoint
*/}}
{{- define "fluxion.otlpEndpoint" -}}
{{- if .Values.otelCollector.enabled }}
{{- printf "http://%s:%d" (include "fluxion.otelCollector.serviceName" .) (int .Values.otelCollector.service.grpcPort) }}
{{- else }}
{{- .Values.config.otel.otlpEndpoint | default "http://localhost:4317" }}
{{- end }}
{{- end }}

{{/*
ArgoCD sync wave annotation
*/}}
{{- define "fluxion.argocd.syncWave" -}}
{{- if .wave }}
argocd.argoproj.io/sync-wave: {{ .wave | quote }}
{{- end }}
{{- end }}
