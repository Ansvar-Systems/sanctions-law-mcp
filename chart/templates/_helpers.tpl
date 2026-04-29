{{- define "sanctions-law-mcp.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "sanctions-law-mcp.labels" -}}
app.kubernetes.io/name: sanctions-law-mcp
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: ansvar-mcp-fleet
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- end -}}

{{- define "sanctions-law-mcp.selectorLabels" -}}
app.kubernetes.io/name: sanctions-law-mcp
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
