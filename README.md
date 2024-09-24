# Wallets & Tokens API

## Estructura

La API es un monorepo manejado con [Turborepo](https://turbo.build/).
Los _workspaces_ estan separados en:

- Packages: _Librerias internas_ para las aplicaciones
  - Domain: Donde se encuentra la lógica de negocio y los contratos
  - Adapters: Donde se encuentran las implementaciones de los contratos
  - Node: El servidor NodeJS que utiliza los servicios hechos por el _Domain_

## Comandos importantes

Los comandos que pueden ser útiles con Turborepo son:

- turbo run @repo/adapters#db-push (para pushear cambios en la DB)
- turbo run @repo/adapters#generate (para generar el esquema de postgres)
- pnpm i (instala todas las dependencias de todos los packages)
- pnpm i {package_name} --recursive --filter={package_name}

El package*name se escribe con @repo/{package}, por ejemplo*@repo/domain\_
