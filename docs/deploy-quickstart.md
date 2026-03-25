# 部署与测试快速开始

在项目根目录执行：

1. 初始化依赖与应用
```powershell
powershell -ExecutionPolicy Bypass -File .\deploy.ps1
```

2. 运行全部测试
```powershell
powershell -ExecutionPolicy Bypass -File .\run_tests.ps1
```

3. 启动服务
```powershell
powershell -ExecutionPolicy Bypass -File .\run_server.ps1
```

服务地址：`http://127.0.0.1:8010`  
健康检查：`GET /healthz`
