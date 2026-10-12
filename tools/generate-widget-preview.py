"""Generate the Android picker preview from the same layouts as the live widget.

Pass a JSON file with date -> {label, badge} entries computed by the app's
pinned lunar library. This tool changes no application or user data.
"""
import calendar
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
LAYOUT = PROJECT / 'android/res/layout'
ANDROID = 'http://schemas.android.com/apk/res/android'
ET.register_namespace('android', ANDROID)


def prop(node, name, value):
    node.set(f'{{{ANDROID}}}{name}', str(value))


def view(root, name):
    for node in root.iter():
        if node.get(f'{{{ANDROID}}}id', '').split('/')[-1] == name:
            return node
    raise ValueError(name)


def set_text(root, name, text, color=None):
    node = view(root, name)
    prop(node, 'text', text)
    prop(node, 'visibility', 'visible' if text else 'gone')
    if color:
        prop(node, 'textColor', color)


labels = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
root = ET.parse(LAYOUT / 'calendar_widget.xml').getroot()
set_text(root, 'widget_month', '10月')
set_text(root, 'widget_year', '2026')
for index, name in enumerate('一二三四五六日'):
    weekday = ET.parse(LAYOUT / 'widget_weekday.xml').getroot()
    prop(weekday, 'text', name)
    prop(weekday, 'gravity', 'start|center_vertical')
    prop(weekday, 'paddingStart', '10dp')
    prop(weekday, 'textSize', '9dp')
    prop(weekday, 'textColor', '#A36F69' if index >= 5 else '#636B65')
    view(root, 'widget_weekdays').append(weekday)

schedules = {'2026-10-01': '午后小聚', '2026-10-09': '项目讨论', '2026-10-16': '健身'}
money = {'2026-10-01': ('−58', '+120'), '2026-10-09': ('−28.5', ''), '2026-10-12': ('−36', '')}
for dates in calendar.Calendar(firstweekday=0).monthdatescalendar(2026, 10):
    week = ET.parse(LAYOUT / 'widget_week.xml').getroot()
    prop(view(week, 'widget_week_rule'), 'visibility', 'gone')
    for day in dates:
        key = day.isoformat()
        cell = ET.parse(LAYOUT / 'widget_day.xml').getroot()
        outside = day.month != 10
        background = 'widget_day_outside' if outside else 'widget_day_weekend' if day.weekday() >= 5 else 'widget_day_background'
        if key == '2026-10-12':
            background = 'widget_day_today'
            prop(view(cell, 'widget_date'), 'background', '@drawable/widget_today')
        prop(view(cell, 'widget_day_surface'), 'background', '@drawable/' + background)
        set_text(cell, 'widget_date', day.day, '#FFFFFF' if key == '2026-10-12' else '#BBBFB5' if outside else '#A36F69' if day.weekday() >= 5 else '#37433F')
        label = labels.get(key, {})
        set_text(cell, 'widget_observance', label.get('label', ''), '#BBBFB5' if outside else '#A36F69' if label.get('festival') else '#636B65')
        set_text(cell, 'widget_holiday_badge', label.get('badge', ''), '#526B61')
        if key in schedules:
            set_text(cell, 'widget_event', schedules[key], '#526B61')
        if key in money:
            expense, income = money[key]
            set_text(cell, 'widget_expense', expense, '#965E57')
            set_text(cell, 'widget_income', income, '#526F5D')
        view(week, 'widget_week').append(cell)
    view(root, 'widget_weeks').append(week)

ET.indent(root, space='    ')
ET.ElementTree(root).write(LAYOUT / 'calendar_widget_preview.xml', encoding='utf-8', xml_declaration=True)
print('PICKER_PREVIEW_UPDATED 35 date frames')
