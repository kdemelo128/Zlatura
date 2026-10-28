"""Print LibreOffice's recalculated values for the given cells: lo_values.py file.xlsx 'Sheet!A1' ..."""
import sys, subprocess, time, os, uno
from com.sun.star.beans import PropertyValue
path = os.path.abspath(sys.argv[1])
# one LibreOffice per browser-run slot (run.sh): its own socket port and user profile, so parallel runs never meet
PORT = os.environ.get('LO_PORT_VALUES', '2003')
PROFILE = ['-env:UserInstallation=file://' + os.environ['LO_PROFILE']] if os.environ.get('LO_PROFILE') else []
proc = subprocess.Popen(['soffice', '--headless', '--invisible', '--norestore', '--accept=socket,host=localhost,port=' + PORT + ';urp;'] + PROFILE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(60):
    try:
        local = uno.getComponentContext()
        ctx = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local).resolve('uno:socket,host=localhost,port=' + PORT + ';urp;StarOffice.ComponentContext'); break
    except Exception: time.sleep(0.5)
p = PropertyValue(); p.Name = 'Hidden'; p.Value = True
doc = ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', ctx).loadComponentFromURL('file://' + path, '_blank', 0, (p,))
doc.calculateAll()
for a in sys.argv[2:]:
    sh, cell = a.rsplit('!', 1)
    c = doc.Sheets.getByName(sh).getCellRangeByName(cell)
    print(a, c.getValue() if c.FormulaResultType2 == 1 or c.getType().value == 'VALUE' else repr(c.getString()))
doc.close(True); proc.terminate()
