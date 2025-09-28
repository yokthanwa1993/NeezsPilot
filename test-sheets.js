#!/usr/bin/env node
require('dotenv').config();
const { addTodoForSource, listTodosForSource } = require('./todoSheets');

async function testGoogleSheetsConnection() {
  console.log('🧪 ทดสอบการเชื่อมต่อ Google Sheets...');
  
  // Check environment variables
  const requiredVars = ['GOOGLE_CLIENT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'TODO_SHEETS_SPREADSHEET_ID'];
  for (const varName of requiredVars) {
    if (!process.env[varName] || process.env[varName] === 'YOUR_SPREADSHEET_ID_HERE') {
      console.error(`❌ ตัวแปร ${varName} ยังไม่ได้ตั้งค่าใน .env`);
      if (varName === 'TODO_SHEETS_SPREADSHEET_ID') {
        console.log('💡 กรุณาสร้าง Google Sheets ใหม่และนำ Spreadsheet ID มาใส่ใน .env');
        console.log('   หรือเปิด: https://sheets.google.com/ แล้วสร้างชีตใหม่');
        console.log('   แล้วแชร์ให้กับ neezspilot-sheets@neezs-v1.iam.gserviceaccount.com (Editor)');
      }
      process.exit(1);
    }
  }
  
  const testSource = { userId: 'test-user-123' };
  
  try {
    console.log('📝 เพิ่มรายการทดสอบ...');
    const newTodo = await addTodoForSource(testSource, {
      text: 'ทดสอบการเชื่อมต่อ Google Sheets',
      userId: 'test-system'
    });
    console.log('✅ เพิ่มรายการสำเร็จ:', newTodo);
    
    console.log('📋 ดึงรายการทดสอบ...');
    const todos = await listTodosForSource(testSource, { limit: 5 });
    console.log('✅ ดึงรายการสำเร็จ:', todos.length, 'รายการ');
    
    if (todos.length > 0) {
      console.log('📄 รายการล่าสุด:');
      todos.forEach((todo, idx) => {
        console.log(`  ${idx + 1}. ${todo.text} (${todo.status || 'open'})`);
      });
    }
    
    console.log('\n🎉 การเชื่อมต่อ Google Sheets สำเร็จ!');
    
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error.message);
    
    if (error.message.includes('Requested entity was not found')) {
      console.log('\n💡 แก้ไข:');
      console.log('1. ตรวจสอบ TODO_SHEETS_SPREADSHEET_ID ใน .env ว่าถูกต้อง');
      console.log('2. แชร์ชีตให้กับ neezspilot-sheets@neezs-v1.iam.gserviceaccount.com (Editor access)');
    }
    
    if (error.message.includes('insufficient authentication scopes')) {
      console.log('\n💡 แก้ไข: Service Account ไม่มีสิทธิ์เข้าถึง Sheets API');
    }
    
    process.exit(1);
  }
}

// Run test
testGoogleSheetsConnection();