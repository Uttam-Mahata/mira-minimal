import asyncio
import os
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from dotenv import load_dotenv

load_dotenv()

async def list_tools():
    ADO_ORG_NAME = os.getenv("ADO_ORG_NAME")
    ADO_PAT = os.getenv("ADO_PAT")
    
    server_params = StdioServerParameters(
        command="npx",
        args=[
            "-y",
            "@azure-devops/mcp",
            ADO_ORG_NAME,
            "--authentication",
            "envvar",
            "-d", "core", "work-items"
        ],
        env={
            "ADO_PAT": ADO_PAT,
            "ADO_MCP_AUTH_TOKEN": ADO_PAT,
            "AZURE_DEVOPS_ORG_URL": f"https://dev.azure.com/{ADO_ORG_NAME}",
            "AZURE_DEVOPS_AUTH_METHOD": "pat",
            "AZURE_DEVOPS_PAT": ADO_PAT,
            "AZURE_DEVOPS_DEFAULT_PROJECT": os.getenv("ADO_PROJECT", "MIRA"),
            "PATH": os.getenv("PATH")
        }
    )
    
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            # Call core_list_projects
            result = await session.call_tool("core_list_projects", {})
            print("Available projects:")
            print(result.content[0].text)

if __name__ == "__main__":
    asyncio.run(list_tools())
