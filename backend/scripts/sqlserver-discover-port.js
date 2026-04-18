require('dotenv').config();
const dgram = require('dgram');
const net = require('net');
const { exec } = require('child_process');

const INSTANCE_NAME = process.env.SQLSERVER_INSTANCE || 'WORLDOFFICE14';
const SERVER_HOST = process.env.SQLSERVER_HOST || 'SERTECNO';

// SQL Server Browser usa UDP puerto 1434
const BROWSER_PORT = 1434;

function sendBrowserRequest(host, instanceName) {
    return new Promise((resolve, reject) => {
        const client = dgram.createSocket('udp4');
        let resolved = false;
        
        client.on('message', (msg) => {
            if (resolved) return;
            resolved = true;
            client.close();
            
            const response = msg.toString('ucs2');
            
            // Buscar el bloque de la instancia
            const blocks = response.split('\x00\x00\x00\x00');
            for (const block of blocks) {
                if (block.includes(instanceName)) {
                    // Buscar tcp:puerto en el bloque
                    const tcpMatch = block.match(/tcp\s*(\d+)/i);
                    if (tcpMatch) {
                        resolve(tcpMatch[1]);
                        return;
                    }
                }
            }
            reject(new Error(`Instancia ${instanceName} no encontrada en respuesta del browser`));
        });
        
        client.on('error', (err) => {
            if (resolved) return;
            resolved = true;
            client.close();
            reject(err);
        });
        
        // CLNT_UCAST_INSTANCE (0x03)
        const message = Buffer.from([0x03]);
        client.send(message, 0, message.length, BROWSER_PORT, host, (err) => {
            if (err) {
                if (resolved) return;
                resolved = true;
                client.close();
                reject(err);
            }
        });
        
        setTimeout(() => {
            if (resolved) return;
            resolved = true;
            client.close();
            reject(new Error('Timeout esperando respuesta del browser SQL'));
        }, 3000);
    });
}

async function tryCommonPorts(host) {
    const commonPorts = [1433, 2433, 2434, 3433, 5433, 6433, 7433, 8433, 9433];
    const openPorts = [];
    
    for (const port of commonPorts) {
        try {
            const isOpen = await testPort(host, port);
            if (isOpen) {
                openPorts.push(port);
                console.log(`   → Puerto ${port} está ABIERTO`);
            }
        } catch (e) {
            // ignorar
        }
    }
    return openPorts.length > 0 ? openPorts[0] : null;
}

function testPort(host, port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        const timeout = 1000;
        
        socket.setTimeout(timeout);
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.once('error', () => {
            socket.destroy();
            resolve(false);
        });
        
        socket.connect(port, host);
    });
}

async function getPortViaPowerShell() {
    return new Promise((resolve) => {
        // Método 1: Usando sc.exe (más confiable)
        const cmd = `sc.exe query "MSSQL$WORLDOFFICE14" | findstr "STATE"`;
        
        exec(cmd, (error) => {
            if (error) {
                resolve(null);
                return;
            }
            
            // Si el servicio existe, buscar puerto en registro
            const regCmd = `reg query "HKLM\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\Instance Names\\SQL" /v WORLDOFFICE14 2>nul`;
            
            exec(regCmd, (regError, regStdout) => {
                if (regError || !regStdout) {
                    resolve(null);
                    return;
                }
                
                // Extraer el nombre de la instancia raíz
                const lines = regStdout.split('\n');
                for (const line of lines) {
                    if (line.includes('WORLDOFFICE14')) {
                        const parts = line.trim().split(/\s+/);
                        const instanceRoot = parts[parts.length - 1];
                        
                        if (instanceRoot) {
                            // Buscar puerto TCP en registro de esa instancia
                            const portCmd = `reg query "HKLM\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\${instanceRoot}\\MSSQLServer\\SuperSocketNetLib\\Tcp\\IPAll" /v TcpPort 2>nul`;
                            
                            exec(portCmd, (portError, portStdout) => {
                                if (portError || !portStdout) {
                                    resolve(null);
                                    return;
                                }
                                
                                const match = portStdout.match(/TcpPort\s+REG_SZ\s+(\d+)/i);
                                if (match) {
                                    resolve(match[1]);
                                } else {
                                    // Buscar puerto dinámico
                                    const dynCmd = `reg query "HKLM\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\${instanceRoot}\\MSSQLServer\\SuperSocketNetLib\\Tcp\\IPAll" /v TcpDynamicPorts 2>nul`;
                                    
                                    exec(dynCmd, (dynError, dynStdout) => {
                                        if (dynError || !dynStdout) {
                                            resolve(null);
                                            return;
                                        }
                                        const dynMatch = dynStdout.match(/TcpDynamicPorts\s+REG_SZ\s+(\d+)/i);
                                        resolve(dynMatch ? dynMatch[1] : null);
                                    });
                                }
                            });
                            return;
                        }
                        break;
                    }
                }
                resolve(null);
            });
        });
    });
}

async function main() {
    console.log(`\n🔍 Buscando puerto de instancia: ${INSTANCE_NAME}`);
    console.log(`📡 Servidor: ${SERVER_HOST}\n`);
    
    // Método 1: PowerShell/WMI (más confiable en Windows)
    console.log('[1/3] Intentando vía Registro de Windows...');
    const regPort = await getPortViaPowerShell();
    if (regPort && regPort !== '0') {
        console.log(`✅ Puerto encontrado (Registro): ${regPort}`);
        printEnvConfig(regPort);
        return;
    }
    
    // Método 2: SQL Server Browser UDP
    console.log('[2/3] Intentando SQL Server Browser (UDP 1434)...');
    try {
        const udpPort = await sendBrowserRequest(SERVER_HOST, INSTANCE_NAME);
        console.log(`✅ Puerto encontrado (Browser): ${udpPort}`);
        printEnvConfig(udpPort);
        return;
    } catch (error) {
        console.log(`❌ Browser falló: ${error.message}`);
    }
    
    // Método 3: probar puertos comunes
    console.log('[3/3] Probando puertos comunes...');
    const commonPort = await tryCommonPorts(SERVER_HOST);
    if (commonPort) {
        console.log(`✅ Puerto encontrado (common ports): ${commonPort}`);
        printEnvConfig(commonPort);
    } else {
        console.log('\n❌ No se pudo detectar el puerto automáticamente.');
        printManualInstructions();
    }
}

function printEnvConfig(port) {
    console.log(`\n📝 Agrega ESTO a tu backend/.env:`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`SQLSERVER_HOST=${SERVER_HOST}`);
    console.log(`SQLSERVER_PORT=${port}`);
    console.log(`SQLSERVER_DATABASE=Melissa_2023`);
    console.log(`SQLSERVER_USER=${process.env.SQLSERVER_USER || 'Jabes'}`);
    console.log(`SQLSERVER_PASSWORD=${process.env.SQLSERVER_PASSWORD || 'TU_PASSWORD'}`);
    console.log(`SQLSERVER_ENCRYPT=false`);
    console.log(`SQLSERVER_TRUST_CERT=true`);
    console.log(`# ELIMINA o comenta SQLSERVER_INSTANCE`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

function printManualInstructions() {
    console.log(`\n🔧 SOLUCIÓN MANUAL (rápida):`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Ejecuta este comando en PowerShell (como administrador):\n`);
    console.log(`  netstat -ano | findstr "LISTENING" | findstr "1433"`);
    console.log(`\nO prueba directamente con el puerto más común:`);
    console.log(`\n  SQLSERVER_PORT=1433`);
    console.log(`\nSi 1433 no funciona, prueba 2433, 3433, 5433, 6433`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

main().catch(console.error);