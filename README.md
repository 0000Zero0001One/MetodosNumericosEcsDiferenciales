# ThermoSys — Simulador de enfriamiento de equipos informáticos

Aplicación web académica para modelar el enfriamiento de un equipo informático mediante la ley de enfriamiento de Newton y comparar la solución analítica con los métodos de Heun y Runge-Kutta clásico de cuarto orden (RK4).

## 1. Tecnologías

- HTML5
- CSS3
- JavaScript
- Bootstrap 5.3
- Bootstrap Icons
- Chart.js 4
- IndexedDB (base de datos local del navegador)

## 2. Estructura del proyecto

```text
enfriamiento_equipos/
├── index.html
├── css/
│   └── styles.css
├── js/
│   └── app.js
└── README.md
```

## 3. Cómo abrirlo en Visual Studio Code

1. Descomprime `ThermoSys_Enfriamiento.zip`.
2. Abre Visual Studio Code.
3. Selecciona **Archivo > Abrir carpeta** y elige `enfriamiento_equipos`.
4. Instala la extensión **Live Server** (Ritwick Dey), si todavía no la tienes.
5. Haz clic derecho sobre `index.html` y selecciona **Open with Live Server**.
6. Se abrirá la aplicación en el navegador, normalmente en una dirección local como `http://127.0.0.1:5500`.

También puedes abrir `index.html` directamente en un navegador moderno. Para desarrollo se recomienda Live Server.

## 4. Modelo matemático

Se utiliza la ley de enfriamiento de Newton:

\[
\frac{dT}{dt}=-k(T-T_a), \qquad T(0)=T_0
\]

Su solución analítica es:

\[
T(t)=T_a+(T_0-T_a)e^{-kt}
\]

Unidades:
- Temperatura: grados Celsius (°C).
- Tiempo: minutos.
- Constante de enfriamiento: min⁻¹.

Los valores iniciales de la interfaz son hipotéticos y sirven como demostración. Para un estudio experimental deben reemplazarse por datos medidos y justificarse la constante `k`.

## 5. Métodos implementados

### Heun

\[
k_1=f(t_n,y_n)
\]
\[
k_2=f(t_n+h,y_n+hk_1)
\]
\[
y_{n+1}=y_n+\frac{h}{2}(k_1+k_2)
\]

### RK4 clásico

\[
k_1=f(t_n,y_n)
\]
\[
k_2=f(t_n+h/2,y_n+hk_1/2)
\]
\[
k_3=f(t_n+h/2,y_n+hk_2/2)
\]
\[
k_4=f(t_n+h,y_n+hk_3)
\]
\[
y_{n+1}=y_n+\frac{h}{6}(k_1+2k_2+2k_3+k_4)
\]

La aplicación calcula cada método con `h` y `h/2`, para comparar el efecto del tamaño de paso. Si la duración no es múltiplo exacto de `h`, el último paso se ajusta para terminar exactamente en el tiempo solicitado.

## 6. Base de datos local: IndexedDB

La aplicación crea automáticamente una base denominada `ThermoSysDB`, versión 1, con un almacén de objetos denominado `pruebas`.

Cada registro contiene:
- `id`: identificador autoincremental.
- `nombre`: nombre del ensayo.
- `fecha`: fecha y hora de guardado.
- `parametros`: T₀, Tₐ, k, duración, h y temperatura objetivo.
- `resultado`: temperaturas finales y errores de Heun y RK4.

Operaciones disponibles:
- **Guardar:** almacena la configuración y el resumen del resultado actual.
- **Recuperar:** carga los parámetros de un registro en el formulario y ejecuta nuevamente la simulación.
- **Eliminar:** elimina un ensayo individual.
- **Eliminar todos:** vacía el almacén después de confirmar.
- **Exportar respaldo JSON:** descarga los registros para conservarlos.
- **Importar respaldo JSON:** incorpora los registros de un respaldo.

### ¿Dónde se almacenan los datos?

IndexedDB guarda los datos en el perfil del navegador, asociados al origen (dominio y puerto) desde el cual se abrió la aplicación. No se guardan dentro de una carpeta del proyecto ni se sincronizan automáticamente entre dispositivos.

Para GitHub Pages, la aplicación seguirá funcionando con IndexedDB, pero cada visitante tendrá su propia base local. No es una base de datos central compartida. Si se requiere que varios usuarios consulten y modifiquen los mismos registros, será necesario incorporar posteriormente un backend y una base de datos remota.

## 7. Prueba sugerida

Con los valores iniciales:
- T₀ = 75 °C
- Tₐ = 22 °C
- k = 0.035 min⁻¹
- Duración = 120 min
- h = 10 min
- Objetivo = 30 °C

Pasos:
1. Ejecuta la simulación.
2. Observa la gráfica de la solución analítica, Heun y RK4.
3. Compara la tabla de iteraciones.
4. Revisa la tabla de errores para `h` y `h/2`.
5. Guarda el ensayo con un nombre.
6. Modifica los parámetros y ejecuta otra prueba.
7. Recupera el primer ensayo desde el historial.
8. Exporta el respaldo JSON y, si deseas, vuelve a importarlo.

## 8. Validaciones y consideraciones

- Se valida que `k` sea positiva.
- Se valida que T₀ sea mayor o igual que Tₐ.
- Se valida que la temperatura objetivo esté entre Tₐ y T₀.
- Se controlan duración, tamaño de paso y cantidad de iteraciones.
- El error relativo porcentual no se define cuando la solución exacta es cero.
- Los gráficos usan Chart.js mediante CDN; Bootstrap, Bootstrap Icons y Google Fonts también se cargan desde CDN. Se necesita conexión a Internet para descargar estas bibliotecas al abrir la página por primera vez.
- IndexedDB requiere un navegador moderno. Para desarrollo local, utiliza Live Server.

## 9. Archivos principales

- `index.html`: estructura y contenido de la aplicación.
- `css/styles.css`: diseño visual y adaptación a móviles.
- `js/app.js`: modelo matemático, métodos numéricos, gráficas, validación y operaciones IndexedDB.

---
Proyecto académico — COM-254 Métodos Numéricos — II-2026
Estudiante: Conde Gutierrez Rafael Blas
