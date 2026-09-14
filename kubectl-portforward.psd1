@{
    RootModule = 'kubectl-portforward.psm1'
    ModuleVersion = '1.0.0'
    Description = 'Persistent kubectl port-forward for webui'
    FunctionsToExport = @('Start-KubectlPortForward', 'Stop-KubectlPortForward')
}
